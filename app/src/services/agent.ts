import type { AgentMessage, UIAction } from '../agent/actions';

/**
 * Detect if a string looks like raw JSON and sanitize it.
 * Returns a user-friendly error message if the content is JSON.
 */
function sanitizeAgentResponse(content: string): string {
  if (!content || typeof content !== 'string') {
    return 'Could not generate summary. Please try again.';
  }

  const trimmed = content.trim();

  // Check if the response looks like JSON (starts with { or [)
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed);
      // If it parses successfully, it's raw JSON - return error message
      return 'Could not generate summary. Please try again.';
    } catch {
      // Not valid JSON, return as-is
      return content;
    }
  }

  return content;
}

export type AgentStepRequest = {
  sessionId: string;
  history: Array<Pick<AgentMessage, 'role' | 'content' | 'ts'>>;
  uiContext: {
    path: string;
    search: string;
  };
  answer: string;
};

export type AgentStepResponse = {
  assistantMessage: string;
  actions: UIAction[];
};

export async function agentStep(req: AgentStepRequest): Promise<AgentStepResponse> {
  const res = await fetch('/api/demo/agent/step', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });

  const data = await res.json();
  if (!data?.success) {
    throw new Error(data?.error || 'Agent step failed');
  }

  const sanitizedMessage = sanitizeAgentResponse(data.assistantMessage || '');
  return { assistantMessage: sanitizedMessage, actions: data.actions || [] };
}

