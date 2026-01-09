import type { AgentMessage, UIAction } from '../agent/actions';

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
  return { assistantMessage: data.assistantMessage || '', actions: data.actions || [] };
}

