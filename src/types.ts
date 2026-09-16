export type Priority = "urgent" | "important" | "normal" | "low";
export type Disposition = "auto_reply" | "needs_you" | "no_action";

export type ChatMessage = {
  fromMe: boolean;
  sender: string;
  text: string;
  timestamp: number;
  timeLabel: string;
};

export type Conversation = {
  contact: string;
  chatId: string;
  isGroup: boolean;
  lastTimestamp: number;
  lastPreview: string;
  unread: boolean;
  messages: ChatMessage[];
};

export type ConversationDecision = {
  contact: string;
  chatId: string;
  isGroup: boolean;
  latestAt: string;
  topic: string;
  whatTheySaid: string;
  theyNeed: string;
  priority: Priority;
  disposition: Disposition;
  suggestedReply: string;
  autoReplyText?: string;
  reason: string;
  confidence: number;
  uncertainty: boolean;
  requiresApproval: boolean;
};

export type SendResult = {
  contact: string;
  chatId: string;
  text: string;
  sent: boolean;
  skippedReason?: string;
};

export type RunReport = {
  generatedAt: string;
  lookbackMinutes: number;
  policyFile: string;
  dryRun: boolean;
  conversations: ConversationDecision[];
  sent: SendResult[];
  errors: string[];
};
