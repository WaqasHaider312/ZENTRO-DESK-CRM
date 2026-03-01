// ============================================================
// ZENTRO DESK - Shared TypeScript Types
// Mirrors the Supabase schema exactly
// ============================================================

export type PlanType = 'trial' | 'starter' | 'pro' | 'enterprise'
export type MemberRole = 'owner' | 'admin' | 'agent'
export type ChannelType = 'whatsapp' | 'facebook' | 'instagram' | 'widget' | 'email'
export type ConversationStatus = 'open' | 'in_progress' | 'pending' | 'resolved'
export type SenderType = 'contact' | 'agent' | 'bot' | 'system' | 'ai'
export type KnowledgeBaseStatus = 'processing' | 'ready' | 'failed'
export type KnowledgeBaseType = 'docx' | 'url'
export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'file' | 'location' | 'template' | 'activity'

export interface Organization {
  id: string
  name: string
  slug: string
  email: string
  logo_url?: string
  website?: string
  timezone: string
  plan: PlanType
  trial_ends_at?: string
  is_active: boolean
  max_agents: number
  ai_prompt?: string
  created_at: string
  updated_at: string
}

export interface AgentProfile {
  id: string
  organization_id: string
  full_name: string
  email: string
  avatar_url?: string
  role: MemberRole
  is_active: boolean
  availability: 'online' | 'busy' | 'offline'
  created_at: string
  updated_at: string
}

export interface Inbox {
  id: string
  organization_id: string
  name: string
  channel_type: ChannelType
  is_active: boolean
  // WhatsApp
  wa_phone_number?: string
  wa_phone_number_id?: string
  wa_waba_id?: string
  wa_access_token?: string
  wa_webhook_verify_token?: string
  // Facebook / Instagram
  fb_page_id?: string
  fb_page_name?: string
  fb_access_token?: string
  ig_account_id?: string
  // Widget
  widget_color?: string
  widget_title?: string
  widget_subtitle?: string
  widget_position?: 'left' | 'right'
  widget_allowed_domains?: string[]
  // Email
  email_address?: string
  // AI
  ai_enabled: boolean
  // Settings
  auto_assign: boolean
  working_hours_enabled: boolean
  working_hours?: Record<string, { open: string; close: string }>
  created_at: string
  updated_at: string
}

export interface Contact {
  id: string
  organization_id: string
  name?: string
  email?: string
  phone?: string
  avatar_url?: string
  location?: string
  company?: string
  notes?: string
  wa_id?: string
  fb_psid?: string
  ig_id?: string
  additional_info?: Record<string, unknown>
  is_blocked: boolean
  created_at: string
  updated_at: string
}

export interface Label {
  id: string
  organization_id: string
  name: string
  color: string
  created_at: string
}

export interface Conversation {
  id: string
  organization_id: string
  inbox_id: string
  contact_id: string
  assigned_agent_id?: string
  status: ConversationStatus
  subject?: string
  latest_message?: string
  latest_message_at?: string
  latest_message_sender?: SenderType
  unread_count: number
  contact_last_seen?: string
  snoozed_until?: string
  ai_handled: boolean
  ai_escalated_at?: string
  channel_conversation_id?: string
  meta?: Record<string, unknown>
  created_at: string
  updated_at: string
  // Joined fields
  contact?: Contact
  inbox?: Inbox
  assigned_agent?: AgentProfile
  labels?: Label[]
}

export interface Message {
  id: string
  conversation_id: string
  organization_id: string
  sender_type: SenderType
  sender_id?: string
  sender_name?: string
  message_type: MessageType
  content?: string
  attachment_urls?: string[]
  attachment_meta?: Record<string, unknown>
  channel_message_id?: string
  is_read: boolean
  is_private: boolean
  is_deleted: boolean
  meta?: Record<string, unknown>
  created_at: string
}

export interface CannedResponse {
  id: string
  organization_id: string
  created_by?: string
  title: string
  content: string
  shortcut?: string
  use_count: number
  created_at: string
  updated_at: string
}

export interface Invitation {
  id: string
  organization_id: string
  invited_by?: string
  email: string
  role: MemberRole
  token: string
  accepted: boolean
  expires_at: string
  created_at: string
}

export interface Activity {
  id: string
  organization_id: string
  conversation_id?: string
  actor_id?: string
  actor_name?: string
  activity_type: string
  meta?: Record<string, unknown>
  created_at: string
}

// UI-specific types
export interface NavItem {
  label: string
  href: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any
  badge?: number
}

export interface KnowledgeBaseSource {
  id: string
  organization_id: string
  type: KnowledgeBaseType
  name: string
  file_path?: string
  source_url?: string
  raw_content?: string
  status: KnowledgeBaseStatus
  error_message?: string
  created_at: string
  updated_at: string
}

// ── AI Protocols ──────────────────────────────────────────────────────

export interface AiProtocolParam {
  id: string
  protocol_id: string
  param_name: string
  description: string
  required: boolean
  sort_order: number
}

export type AiProtocolStepType = 'call_api' | 'send_message' | 'lookup_document'

export interface AiProtocolStep {
  id: string
  protocol_id: string
  step_order: number
  type: AiProtocolStepType
  config: {
    // call_api
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    url?: string
    headers?: Record<string, string>
    body?: Record<string, any>
    // send_message
    message?: string
    // lookup_document
    document_name?: string
    instruction?: string
  }
  created_at: string
}

export interface AiProtocol {
  id: string
  organization_id: string
  name: string
  trigger_description: string
  is_active: boolean
  requires_confirmation: boolean
  params?: AiProtocolParam[]
  steps?: AiProtocolStep[]
  created_at: string
  updated_at: string
}