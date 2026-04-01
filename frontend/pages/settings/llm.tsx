import { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { isRequestFromIframe } from '@/utils/auth';
import { ToolbarLayout } from '@/components/ToolbarLayout';
import styled from '@emotion/styled';
import { useAtom } from 'jotai';
import {
  persistedLLMSettingsAtom,
  loadLLMSettingsAtom,
  clearLLMSettingsAtom,
  LLMSettings,
  DEFAULT_SYSTEM_PROMPT,
} from '@/atoms/llmSettings';
import { useEffect, useState } from 'react';
import { Button, Input, Switch, Textarea, Spinner } from '@heroui/react';
import { FiSave } from '@react-icons/all-files/fi/FiSave';
import { FiTrash2 } from '@react-icons/all-files/fi/FiTrash2';
import { FiEye } from '@react-icons/all-files/fi/FiEye';
import { FiEyeOff } from '@react-icons/all-files/fi/FiEyeOff';
import { FiAlertCircle } from '@react-icons/all-files/fi/FiAlertCircle';
import { FiCheckCircle } from '@react-icons/all-files/fi/FiCheckCircle';
import { FiXCircle } from '@react-icons/all-files/fi/FiXCircle';
import Link from 'next/link';
import { useText } from '@/components/TranslationProvider';

const Container = styled.div({
  maxWidth: '800px',
  margin: '0 auto',
  padding: '40px 24px',
});

const Header = styled.div({
  marginBottom: '32px',
});

const Title = styled.h1({
  fontSize: '32px',
  fontWeight: 700,
  marginBottom: '8px',
  color: '#000',
});

const Breadcrumb = styled.div({
  fontSize: '14px',
  color: '#666',
  marginBottom: '16px',

  '& a': {
    color: '#0070f3',
    textDecoration: 'none',
    '&:hover': {
      textDecoration: 'underline',
    },
  },
});

const Subtitle = styled.p({
  fontSize: '16px',
  color: '#666',
  lineHeight: '1.6',
});

const FormSection = styled.div({
  marginBottom: '32px',
});

const SectionTitle = styled.h2({
  fontSize: '20px',
  fontWeight: 600,
  marginBottom: '16px',
  color: '#000',
});

const FormGroup = styled.div({
  marginBottom: '24px',
});

const Label = styled.label({
  display: 'block',
  fontSize: '14px',
  fontWeight: 500,
  marginBottom: '8px',
  color: '#374151',
});

const HelpText = styled.p({
  fontSize: '13px',
  color: '#6B7280',
  marginTop: '6px',
  lineHeight: '1.5',
});

const ButtonGroup = styled.div({
  display: 'flex',
  gap: '12px',
  marginTop: '32px',
});

const AlertBox = styled.div({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '12px',
  padding: '16px',
  borderRadius: '8px',
  backgroundColor: '#FEF3C7',
  border: '1px solid #FCD34D',
  marginBottom: '24px',
  fontSize: '14px',
  color: '#92400E',
  lineHeight: '1.5',
});

const InfoBox = styled.div({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '12px',
  padding: '16px',
  borderRadius: '8px',
  backgroundColor: '#EFF6FF',
  border: '1px solid #DBEAFE',
  marginBottom: '24px',
  fontSize: '14px',
  color: '#1E40AF',
  lineHeight: '1.5',
});

const PasswordInputWrapper = styled.div({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
});

const TogglePasswordButton = styled.button({
  position: 'absolute',
  right: '12px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: '#6B7280',
  padding: '8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',

  '&:hover': {
    color: '#374151',
  },
});

const SwitchWrapper = styled.div({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  marginBottom: '24px',
  padding: '16px',
  borderRadius: '8px',
  backgroundColor: '#F9FAFB',
  border: '1px solid #E5E7EB',
});

const TestResultBox = styled.div<{ success: boolean }>(({ success }) => ({
  marginTop: '16px',
  padding: '16px',
  borderRadius: '8px',
  backgroundColor: success ? '#F0FDF4' : '#FEF2F2',
  border: `1px solid ${success ? '#86EFAC' : '#FECACA'}`,
  fontSize: '14px',
  lineHeight: '1.6',
}));

const TestResultHeader = styled.div({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '8px',
  fontWeight: 600,
  fontSize: '15px',
});

const TestResultContent = styled.pre({
  marginTop: '8px',
  padding: '12px',
  borderRadius: '6px',
  backgroundColor: 'rgba(0, 0, 0, 0.05)',
  fontSize: '13px',
  lineHeight: '1.5',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontFamily:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
});

const LLMSettingsPage = () => {
  const t = useText('settingsLLM');
  const [settings, setSettings] = useAtom(persistedLLMSettingsAtom);
  const [, loadSettings] = useAtom(loadLLMSettingsAtom);
  const [, clearSettings] = useAtom(clearLLMSettingsAtom);

  const [formData, setFormData] = useState<LLMSettings>({
    baseURL: '',
    apiKey: '',
    model: '',
    useCustomSettings: false,
    enableMessageHistory: true,
    defaultTemperature: 0.7,
    defaultMaxTokens: 1024,
    defaultTopP: 0.65,
    defaultTopK: 40,
    defaultFrequencyPenalty: 1.15,
    defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
  });

  const [showApiKey, setShowApiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingLLM, setIsSavingLLM] = useState(false);
  const [saveLLMSuccess, setSaveLLMSuccess] = useState(false);
  const [isSavingGen, setIsSavingGen] = useState(false);
  const [saveGenSuccess, setSaveGenSuccess] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    response?: string;
  } | null>(null);

  // Local string state for numeric fields so users can freely type values
  const [rawTemperature, setRawTemperature] = useState(
    String(formData.defaultTemperature)
  );
  const [rawMaxTokens, setRawMaxTokens] = useState(
    String(formData.defaultMaxTokens)
  );
  const [rawTopP, setRawTopP] = useState(String(formData.defaultTopP));
  const [rawTopK, setRawTopK] = useState(String(formData.defaultTopK));
  const [rawFrequencyPenalty, setRawFrequencyPenalty] = useState(
    String(formData.defaultFrequencyPenalty)
  );

  useEffect(() => {
    const loadStoredSettings = async () => {
      try {
        const stored = await loadSettings();
        const data = stored || settings;
        const mergedData = {
          ...data,
          defaultSystemPrompt:
            data.defaultSystemPrompt || DEFAULT_SYSTEM_PROMPT,
        };
        setFormData(mergedData);
        // Sync raw string state with loaded settings
        setRawTemperature(String(data.defaultTemperature ?? 0.7));
        setRawMaxTokens(String(data.defaultMaxTokens ?? 1024));
        setRawTopP(String(data.defaultTopP ?? 0.65));
        setRawTopK(String(data.defaultTopK ?? 40));
        setRawFrequencyPenalty(String(data.defaultFrequencyPenalty ?? 1.15));
      } catch (error) {
        console.error('Error loading settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadStoredSettings();
  }, []);

  const handleInputChange = async (
    field: keyof LLMSettings,
    value: string | boolean | number
  ) => {
    const newFormData = {
      ...formData,
      [field]: value,
    };
    setFormData(newFormData);
    setSaveLLMSuccess(false);
    setSaveGenSuccess(false);

    // Auto-save when useCustomSettings toggle is changed
    if (field === 'useCustomSettings') {
      setIsSavingLLM(true);
      try {
        await setSettings(newFormData);
        setSaveLLMSuccess(true);
        setTimeout(() => setSaveLLMSuccess(false), 3000);
      } catch (error) {
        console.error('Error saving settings:', error);
        alert(t('messages.saveFailed'));
      } finally {
        setIsSavingLLM(false);
      }
    }
  };

  const handleSaveLLM = async () => {
    setIsSavingLLM(true);
    try {
      await setSettings(formData);
      setSaveLLMSuccess(true);
      setTimeout(() => setSaveLLMSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      alert(t('messages.saveFailed'));
    } finally {
      setIsSavingLLM(false);
    }
  };

  const handleSaveGen = async () => {
    setIsSavingGen(true);
    try {
      await setSettings(formData);
      setSaveGenSuccess(true);
      setTimeout(() => setSaveGenSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      alert(t('messages.saveFailed'));
    } finally {
      setIsSavingGen(false);
    }
  };

  const handleClear = async () => {
    if (confirm(t('messages.confirmClear'))) {
      setIsSavingLLM(true);
      try {
        await clearSettings();
        setFormData({
          baseURL: '',
          apiKey: '',
          model: '',
          useCustomSettings: false,
          enableMessageHistory: true,
          defaultTemperature: 0.7,
          defaultMaxTokens: 1024,
          defaultTopP: 0.65,
          defaultTopK: 40,
          defaultFrequencyPenalty: 1.15,
          defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
        });
        setSaveLLMSuccess(false);
        setSaveGenSuccess(false);
        // Sync raw string state with cleared defaults
        setRawTemperature('0.7');
        setRawMaxTokens('1024');
        setRawTopP('0.65');
        setRawTopK('40');
        setRawFrequencyPenalty('1.15');
      } catch (error) {
        console.error('Error clearing settings:', error);
        alert(t('messages.clearFailed'));
      } finally {
        setIsSavingLLM(false);
      }
    }
  };

  const handleTest = async () => {
    if (!formData.useCustomSettings) {
      alert(t('messages.enableCustom'));
      return;
    }

    if (!formData.baseURL || !formData.model) {
      alert(t('messages.fillRequired'));
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const basePath =
        process.env.NEXT_PUBLIC_BASE_PATH === '/'
          ? ''
          : process.env.NEXT_PUBLIC_BASE_PATH || '';

      const apiMessages = [
        {
          role: 'system',
          content: 'You are a helpful assistant. Please respond briefly.',
        },
        {
          role: 'user',
          content:
            'Hello! Please respond with a brief greeting to confirm you are working.',
        },
      ];

      const response = await fetch(`${basePath}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          model: formData.model,
          max_tokens: 100,
          temperature: 0.7,
          customSettings: formData,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || response.statusText);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullResponse += decoder.decode(value, { stream: true });
      }

      setTestResult({
        success: true,
        message: t('test.success'),
        response: fullResponse,
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: t('messages.testFailed', {
          error:
            error instanceof Error ? error.message : 'Unknown error occurred',
        }),
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <ToolbarLayout>
        <Container>
          <Spinner size="lg" />
        </Container>
      </ToolbarLayout>
    );
  }

  return (
    <ToolbarLayout>
      <Container>
        <Header>
          <Breadcrumb>
            <Link href="/settings">Settings</Link> / LLM Configuration
          </Breadcrumb>
          <Title>LLM Configuration</Title>
          <Subtitle>
            Configure custom LLM API settings. When enabled, DAVE will use your
            custom configuration instead of the default settings. All sensitive
            data is encrypted before being stored in your browser.
          </Subtitle>
        </Header>

        <InfoBox>
          <div style={{ marginTop: '2px' }}>ℹ️</div>
          <div>
            <strong>Encryption & Security:</strong> Your API key and other
            settings are encrypted using AES-GCM encryption before being stored
            in your browser&apos;s local storage. The encryption uses a
            device-specific key, meaning your settings are tied to this browser
            and device.
          </div>
        </InfoBox>

        <FormSection>
          <SwitchWrapper>
            <Switch
              isSelected={formData.useCustomSettings}
              onValueChange={(v) => handleInputChange('useCustomSettings', v)}
              color="primary"
            />
            <div>
              <Label style={{ marginBottom: '4px' }}>
                Use Custom LLM Settings
              </Label>
              <HelpText style={{ marginTop: 0 }}>
                Enable this to use your custom API configuration. When disabled,
                the system will use default environment settings.
              </HelpText>
            </div>
          </SwitchWrapper>

          {formData.useCustomSettings && (
            <AlertBox>
              <div style={{ marginTop: '2px' }}>⚠️</div>
              <div>
                <strong>Important:</strong> Make sure your API endpoint is
                OpenAI-compatible (supports the same API format). This works
                with OpenAI, Azure OpenAI, local models via
                text-generation-webui, LM Studio, Ollama with openai-compatible
                endpoints, and similar services.
              </div>
            </AlertBox>
          )}

          <FormGroup>
            <Label htmlFor="baseURL">API Base URL</Label>
            <Input
              id="baseURL"
              placeholder="https://api.openai.com/v1"
              value={formData.baseURL}
              onChange={(e) => handleInputChange('baseURL', e.target.value)}
              isDisabled={!formData.useCustomSettings}
              className="w-full"
            />
            <HelpText>
              The base URL for your LLM API endpoint. Examples:
              <br />• OpenAI: <code>https://api.openai.com/v1</code>
              <br />• Local server: <code>http://localhost:8000/v1</code>
              <br />• Azure OpenAI:{' '}
              <code>
                https://your-resource.openai.azure.com/openai/deployments/your-deployment
              </code>
            </HelpText>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="apiKey">API Key</Label>
            <PasswordInputWrapper>
              <Input
                id="apiKey"
                type={showApiKey ? 'text' : 'password'}
                placeholder="sk-..."
                value={formData.apiKey}
                onChange={(e) => handleInputChange('apiKey', e.target.value)}
                isDisabled={!formData.useCustomSettings}
                className="w-full"
              />
              <TogglePasswordButton
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                disabled={!formData.useCustomSettings}
              >
                {showApiKey ? '👁️' : '👁️‍🗨️'}
              </TogglePasswordButton>
            </PasswordInputWrapper>
            <HelpText>
              Your API key for authentication. This will be encrypted before
              storage. For local models that don&apos;t require authentication,
              you can use any placeholder value.
            </HelpText>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="model">Model Name</Label>
            <Input
              id="model"
              placeholder="gpt-4, phi4-mini, llama-3.1, etc."
              value={formData.model}
              onChange={(e) => handleInputChange('model', e.target.value)}
              isDisabled={!formData.useCustomSettings}
              className="w-full"
            />
            <HelpText>
              The model identifier to use. This depends on your API provider:
              <br />• OpenAI: <code>gpt-4</code>, <code>gpt-3.5-turbo</code>
              <br />• Local models: <code>phi4-mini</code>,{' '}
              <code>llama-3.1-8b</code>, etc.
              <br />
              Check your API provider&apos;s documentation for available models.
            </HelpText>
          </FormGroup>

          {formData.useCustomSettings && (
            <FormGroup>
              <Button
                color="secondary"
                onPress={handleTest}
                isDisabled={isTesting || !formData.baseURL || !formData.model}
                className="w-full"
              >
                {isTesting ? (
                  <>
                    <Spinner size="sm" className="text-white" /> Testing
                    Connection...
                  </>
                ) : (
                  '🔌 Test Connection'
                )}
              </Button>

              {testResult && (
                <TestResultBox success={testResult.success}>
                  <TestResultHeader>
                    {testResult.success ? (
                      <>
                        <FiCheckCircle size={20} color="#16A34A" />
                        <span style={{ color: '#16A34A' }}>Success</span>
                      </>
                    ) : (
                      <>
                        <FiXCircle size={20} color="#DC2626" />
                        <span style={{ color: '#DC2626' }}>Failed</span>
                      </>
                    )}
                  </TestResultHeader>
                  <div
                    style={{
                      color: testResult.success ? '#166534' : '#991B1B',
                    }}
                  >
                    {testResult.message}
                  </div>
                  {testResult.response && (
                    <div>
                      <strong
                        style={{
                          color: testResult.success ? '#166534' : '#991B1B',
                        }}
                      >
                        Response:
                      </strong>
                      <TestResultContent>
                        {testResult.response}
                      </TestResultContent>
                    </div>
                  )}
                </TestResultBox>
              )}
            </FormGroup>
          )}

          <ButtonGroup>
            <Button
              color="primary"
              onPress={handleSaveLLM}
              isDisabled={isSavingLLM || !formData.useCustomSettings}
            >
              {isSavingLLM ? (
                <Spinner size="sm" className="text-white" />
              ) : (
                'Save LLM Settings'
              )}
            </Button>

            <Button
              color="danger"
              variant="flat"
              onPress={handleClear}
              isDisabled={isSavingLLM}
            >
              Clear LLM Settings
            </Button>

            {saveLLMSuccess && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  color: '#059669',
                  fontWeight: 500,
                }}
              >
                ✓ LLM settings saved successfully!
              </div>
            )}
          </ButtonGroup>

          <InfoBox style={{ marginTop: '24px' }}>
            <div style={{ marginTop: '2px' }}>💡</div>
            <div>
              <strong>Pro Tip:</strong> Use the &quot;Test Connection&quot;
              button above to verify your configuration before saving. This
              sends a simple test message to ensure your API URL, key, and model
              are all working correctly. You can always clear settings to revert
              to defaults if needed.
            </div>
          </InfoBox>
        </FormSection>

        <FormSection style={{ marginTop: '32px' }}>
          <SectionTitle>
            {t('generationDefaults.title') || 'Generation Defaults'}
          </SectionTitle>
          <HelpText style={{ marginBottom: '24px' }}>
            {t('generationDefaults.description') ||
              'Set default values for text generation parameters. These will be used as initial values when starting a new chat.'}
          </HelpText>

          <FormGroup>
            <SwitchWrapper>
              <Switch
                isSelected={formData.enableMessageHistory}
                onValueChange={async (v) => {
                  handleInputChange('enableMessageHistory', v);
                  // Auto-save immediately
                  const newSettings = {
                    ...formData,
                    enableMessageHistory: v,
                  };
                  await setSettings(newSettings);
                }}
                color="primary"
              />
              <div>
                <Label style={{ marginBottom: '4px' }}>
                  {t('form.enableMessageHistory.label')}
                </Label>
                <HelpText style={{ marginTop: '0' }}>
                  {t('form.enableMessageHistory.help')}
                </HelpText>
              </div>
            </SwitchWrapper>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="defaultSystemPrompt">
              {t('generationDefaults.systemPrompt') || 'Default System Prompt'}
            </Label>
            <Textarea
              id="defaultSystemPrompt"
              minRows={6}
              maxRows={20}
              placeholder={DEFAULT_SYSTEM_PROMPT}
              value={formData.defaultSystemPrompt}
              onChange={(e) =>
                handleInputChange('defaultSystemPrompt', e.target.value)
              }
              className="w-full"
            />
            <HelpText>
              {t('generationDefaults.systemPromptHelp') ||
                'The system prompt sent to the LLM. Use {{CONTEXT}} and {{QUESTION}} as placeholders in dev mode. Leave empty to use the built-in default.'}
            </HelpText>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="defaultTemperature">
              {t('generationDefaults.temperature') || 'Temperature'}
            </Label>
            <Input
              id="defaultTemperature"
              type="number"
              step="0.1"
              min="0"
              max="2"
              placeholder="0.7"
              value={rawTemperature}
              onChange={(e) => {
                setRawTemperature(e.target.value);
                const parsed = parseFloat(e.target.value);
                if (!isNaN(parsed)) {
                  handleInputChange('defaultTemperature', parsed);
                }
              }}
              onBlur={() => {
                const parsed = parseFloat(rawTemperature);
                if (isNaN(parsed) || rawTemperature.trim() === '') {
                  const fallback = formData.defaultTemperature ?? 0.7;
                  setRawTemperature(String(fallback));
                } else {
                  const clamped = Math.min(2, Math.max(0, parsed));
                  setRawTemperature(String(clamped));
                  handleInputChange('defaultTemperature', clamped);
                }
              }}
              className="w-full"
            />
            <HelpText>
              {t('generationDefaults.temperatureHelp') ||
                'Controls randomness. Lower values make output more focused and deterministic (0.0-2.0). Default: 0.7'}
            </HelpText>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="defaultMaxTokens">
              {t('generationDefaults.maxTokens') || 'Max Tokens'}
            </Label>
            <Input
              id="defaultMaxTokens"
              type="number"
              step="50"
              min="100"
              max="4096"
              placeholder="1024"
              value={rawMaxTokens}
              onChange={(e) => {
                setRawMaxTokens(e.target.value);
                const parsed = parseInt(e.target.value);
                if (!isNaN(parsed)) {
                  handleInputChange('defaultMaxTokens', parsed);
                }
              }}
              onBlur={() => {
                const parsed = parseInt(rawMaxTokens);
                if (isNaN(parsed) || rawMaxTokens.trim() === '') {
                  const fallback = formData.defaultMaxTokens ?? 1024;
                  setRawMaxTokens(String(fallback));
                } else {
                  const clamped = Math.min(4096, Math.max(100, parsed));
                  setRawMaxTokens(String(clamped));
                  handleInputChange('defaultMaxTokens', clamped);
                }
              }}
              className="w-full"
            />
            <HelpText>
              {t('generationDefaults.maxTokensHelp') ||
                'Maximum length of generated text (100-4096). Default: 1024'}
            </HelpText>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="defaultTopP">
              {t('generationDefaults.topP') || 'Top P'}
            </Label>
            <Input
              id="defaultTopP"
              type="number"
              step="0.05"
              min="0"
              max="1"
              placeholder="0.65"
              value={rawTopP}
              onChange={(e) => {
                setRawTopP(e.target.value);
                const parsed = parseFloat(e.target.value);
                if (!isNaN(parsed)) {
                  handleInputChange('defaultTopP', parsed);
                }
              }}
              onBlur={() => {
                const parsed = parseFloat(rawTopP);
                if (isNaN(parsed) || rawTopP.trim() === '') {
                  const fallback = formData.defaultTopP ?? 0.65;
                  setRawTopP(String(fallback));
                } else {
                  const clamped = Math.min(1, Math.max(0, parsed));
                  setRawTopP(String(clamped));
                  handleInputChange('defaultTopP', clamped);
                }
              }}
              className="w-full"
            />
            <HelpText>
              {t('generationDefaults.topPHelp') ||
                'Nucleus sampling threshold (0.0-1.0). Default: 0.65'}
            </HelpText>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="defaultTopK">
              {t('generationDefaults.topK') || 'Top K'}
            </Label>
            <Input
              id="defaultTopK"
              type="number"
              step="1"
              min="1"
              max="100"
              placeholder="40"
              value={rawTopK}
              onChange={(e) => {
                setRawTopK(e.target.value);
                const parsed = parseInt(e.target.value);
                if (!isNaN(parsed)) {
                  handleInputChange('defaultTopK', parsed);
                }
              }}
              onBlur={() => {
                const parsed = parseInt(rawTopK);
                if (isNaN(parsed) || rawTopK.trim() === '') {
                  const fallback = formData.defaultTopK ?? 40;
                  setRawTopK(String(fallback));
                } else {
                  const clamped = Math.min(100, Math.max(1, parsed));
                  setRawTopK(String(clamped));
                  handleInputChange('defaultTopK', clamped);
                }
              }}
              className="w-full"
            />
            <HelpText>
              {t('generationDefaults.topKHelp') ||
                'Limits token selection to top K choices (1-100). Default: 40'}
            </HelpText>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="defaultFrequencyPenalty">
              {t('generationDefaults.frequencyPenalty') || 'Frequency Penalty'}
            </Label>
            <Input
              id="defaultFrequencyPenalty"
              type="number"
              step="0.05"
              min="1"
              max="2"
              placeholder="1.15"
              value={rawFrequencyPenalty}
              onChange={(e) => {
                setRawFrequencyPenalty(e.target.value);
                const parsed = parseFloat(e.target.value);
                if (!isNaN(parsed)) {
                  handleInputChange('defaultFrequencyPenalty', parsed);
                }
              }}
              onBlur={() => {
                const parsed = parseFloat(rawFrequencyPenalty);
                if (isNaN(parsed) || rawFrequencyPenalty.trim() === '') {
                  const fallback = formData.defaultFrequencyPenalty ?? 1.15;
                  setRawFrequencyPenalty(String(fallback));
                } else {
                  const clamped = Math.min(2, Math.max(1, parsed));
                  setRawFrequencyPenalty(String(clamped));
                  handleInputChange('defaultFrequencyPenalty', clamped);
                }
              }}
              className="w-full"
            />
            <HelpText>
              {t('generationDefaults.frequencyPenaltyHelp') ||
                'Penalizes token repetition (1.0-2.0). Higher values reduce repetition. Default: 1.15'}
            </HelpText>
          </FormGroup>

          <ButtonGroup>
            <Button
              color="primary"
              onPress={handleSaveGen}
              isDisabled={isSavingGen}
            >
              {isSavingGen ? (
                <>
                  <Spinner size="sm" className="text-white" />{' '}
                  {t('buttons.saving')}
                </>
              ) : (
                t('buttons.save') || 'Save Generation Defaults'
              )}
            </Button>
            <Button
              onPress={() => {
                setFormData({
                  ...formData,
                  defaultTemperature: 0.7,
                  defaultMaxTokens: 1024,
                  defaultTopP: 0.65,
                  defaultTopK: 40,
                  defaultFrequencyPenalty: 1.15,
                  defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
                });
                setRawTemperature('0.7');
                setRawMaxTokens('1024');
                setRawTopP('0.65');
                setRawTopK('40');
                setRawFrequencyPenalty('1.15');
              }}
            >
              {t('generationDefaults.resetToDefaults') || 'Reset to Defaults'}
            </Button>
          </ButtonGroup>

          {saveGenSuccess && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                color: '#16A34A',
                fontWeight: 600,
                marginTop: '16px',
              }}
            >
              <FiCheckCircle style={{ marginRight: '8px' }} />
              {t('buttons.success') ||
                'Generation defaults saved successfully!'}
            </div>
          )}
        </FormSection>
      </Container>
    </ToolbarLayout>
  );
};

export default LLMSettingsPage;

export const getServerSideProps: GetServerSideProps = async (context) => {
  if (process.env.USE_AUTH !== 'false' && !isRequestFromIframe(context.req)) {
    const session = await getServerSession(context.req, context.res, authOptions);

    if (!session) {
      return {
        redirect: {
          destination: '/sign-in',
          permanent: false,
        },
      };
    }
  }

  const locale = process.env.LOCALE || 'ita';
  const localeObj = (await import(`@/translation/${locale}`)).default;

  return {
    props: {
      locale: localeObj,
    },
  };
};
