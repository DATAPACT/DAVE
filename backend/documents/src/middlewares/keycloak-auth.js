import { HTTPError, HTTP_ERROR_CODES } from "../utils/http-error";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

const KEYCLOAK_ISSUER =
  process.env.KEYCLOAK_ISSUER || "http://keycloak:8080/realms/dave";
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_ID || "dave-client";

// Allowlist of trusted token issuers.
// KEYCLOAK_ISSUER is always trusted. Additional issuers (e.g. for iframe SSO from
// external realms) can be added via KEYCLOAK_EXTRA_ISSUERS as a comma-separated list.
const TRUSTED_ISSUERS = new Set(
  [
    KEYCLOAK_ISSUER,
    ...(process.env.KEYCLOAK_EXTRA_ISSUERS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ]
);

console.log(
  `🔐 Keycloak auth configured: issuer=${KEYCLOAK_ISSUER}, clientId=${KEYCLOAK_CLIENT_ID}`,
);
console.log(`🔐 Trusted issuers: ${[...TRUSTED_ISSUERS].join(", ")}`);

// Cache of JWKS clients keyed by issuer URL
const jwksClients = new Map();

function getClientForIssuer(issuer) {
  if (!jwksClients.has(issuer)) {
    jwksClients.set(
      issuer,
      jwksClient({
        jwksUri: `${issuer}/protocol/openid-connect/certs`,
        cache: true,
        cacheMaxAge: 3600000, // 1 hour
        rateLimit: true,
        jwksRequestsPerMinute: 60,
      }),
    );
  }
  return jwksClients.get(issuer);
}

/**
 * Get signing key from the issuer embedded in the token header.
 * Rejects tokens from issuers not in TRUSTED_ISSUERS.
 */
function getKeyForToken(token) {
  return (header, callback) => {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return callback(new Error("Invalid JWT format"));
      const payload = JSON.parse(
        Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
      );
      if (!payload.iss) return callback(new Error("Missing iss claim"));
      if (!TRUSTED_ISSUERS.has(payload.iss)) {
        return callback(new Error(`Untrusted token issuer: ${payload.iss}`));
      }
      const issuerClient = getClientForIssuer(payload.iss);
      issuerClient.getSigningKey(header.kid, (err, key) => {
        if (err) {
          console.error("❌ Error getting signing key:", err.message);
          return callback(err);
        }
        callback(null, key.getPublicKey());
      });
    } catch (e) {
      callback(e);
    }
  };
}

/**
 * Keycloak authentication middleware
 * Validates JWT tokens issued by Keycloak
 */
export const keycloakAuthMiddleware = async (req, res, next) => {
  // Allow public auth endpoints to be called without token
  if (
    req.path.startsWith("/auth") ||
    req.originalUrl.startsWith("/api/auth") ||
    req.originalUrl.startsWith("/api/document/deanonymize-key") ||
    req.originalUrl.startsWith("/api-docs") ||
    req.originalUrl.startsWith("/swagger") ||
    // Allow public GET access to documents by ID
    /^\/api\/document\/[a-f0-9]+\/(true|false)$/.test(req.originalUrl) ||
    /^\/api\/document\/[a-f0-9]+$/.test(req.originalUrl) ||
    /^\/api\/document\/\d+\/(true|false)$/.test(req.originalUrl) ||
    /^\/api\/document\/\d+$/.test(req.originalUrl)
  ) {
    return next();
  }

  // Extract Bearer token
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    if (
      process.env.USE_AUTH === "false" ||
      process.env.ENABLE_AUTH === "false"
    ) {
      const browserId = req.headers["x-browser-id"] || "anon-user";
      req.user = {
        sub: browserId,
        email: `${browserId}@example.com`,
        name: `Anonymous User ${browserId.slice(0, 8)}`,
        preferred_username: browserId,
        email_verified: false,
        roles: [],
        resource_access: {},
        client_roles: [],
        userId: browserId,
      };
      return next();
    } else {
      return next(
        new HTTPError({
          code: HTTP_ERROR_CODES.FORBIDDEN,
          message: "Missing Bearer token.",
        }),
      );
    }
  }

  const token = authHeader.slice(7);

  try {
    // Verify the token with the public key fetched from the issuer embedded in the token.
    // This supports tokens from any Keycloak realm (e.g. iframe SSO from an external realm).
    const payload = await new Promise((resolve, reject) => {
      jwt.verify(
        token,
        getKeyForToken(token),
        { algorithms: ["RS256"] },
        (err, decoded) => {
          if (err) reject(err);
          else resolve(decoded);
        },
      );
    });

    console.log(`✅ Token issuer validated: ${payload.iss}`);

    // Attach user info to request
    req.user = {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      preferred_username: payload.preferred_username,
      email_verified: payload.email_verified,
      roles: payload.realm_access?.roles || [],
      resource_access: payload.resource_access || {},
      client_roles: payload.resource_access?.[KEYCLOAK_CLIENT_ID]?.roles || [],
      // Map Keycloak user ID to userId for compatibility with existing code
      userId: payload.sub,
    };

    console.log(
      `✅ Keycloak auth: validated user ${req.user.email || req.user.preferred_username} (sub: ${req.user.sub})`,
    );
    console.log(`📦 User roles:`, {
      realm_roles: req.user.roles,
      client_roles: req.user.client_roles,
      userId: req.user.userId,
    });
    next();
  } catch (err) {
    console.error("❌ Keycloak JWT verification error:", err.message);

    let message = "Invalid or expired token.";
    if (err.name === "TokenExpiredError") {
      message = "Token has expired.";
    } else if (err.name === "JsonWebTokenError") {
      message = "Invalid token.";
    } else if (err.name === "NotBeforeError") {
      message = "Token not yet valid.";
    }

    return next(
      new HTTPError({
        code: HTTP_ERROR_CODES.FORBIDDEN,
        message,
      }),
    );
  }
};

/**
 * Role-based authorization middleware
 * Use this after keycloakAuthMiddleware to check for specific roles
 *
 * @param {...string} roles - Required roles (user needs at least one)
 * @returns {Function} Express middleware
 *
 * @example
 * router.get('/admin', requireRole('admin'), handler);
 * router.post('/manage', requireRole('admin', 'manager'), handler);
 */
export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(
        new HTTPError({
          code: HTTP_ERROR_CODES.FORBIDDEN,
          message: "Authentication required.",
        }),
      );
    }

    const userRoles = [
      ...(req.user.roles || []),
      ...(req.user.client_roles || []),
    ];
    const hasRole = roles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      console.warn(
        `⚠️  User ${req.user.email || req.user.preferred_username} missing required role. Has: [${userRoles.join(", ")}], Needs one of: [${roles.join(", ")}]`,
      );
      return next(
        new HTTPError({
          code: HTTP_ERROR_CODES.FORBIDDEN,
          message: "Insufficient permissions.",
        }),
      );
    }

    console.log(
      `✅ Role check passed for user ${req.user.email || req.user.preferred_username}: ${roles.join(" or ")}`,
    );
    next();
  };
};

/**
 * Check if user is admin
 * Convenience middleware for admin-only routes
 *
 * @example
 * router.delete('/users/:id', requireAdmin, handler);
 */
export const requireAdmin = requireRole("admin");
