export type EventStatus =
  | "Planning"
  | "Confirmed"
  | "Preparation"
  | "In production"
  | "Completed"
  | "Cancelled";
export interface Client {
  id: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  industry: string;
  initials: string;
  color: string;
  notes: string;
}
export interface Room {
  id: string;
  name: string;
  width: number;
  depth: number;
  height: number;
  capacity: number;
}
export interface Venue {
  id: string;
  name: string;
  city: string;
  category: string;
  rooms: Room[];
  notes: string;
  color: string;
}
export interface ProductionEvent {
  id: string;
  name: string;
  clientId: string;
  venueId: string;
  date: string;
  endDate: string;
  status: EventStatus;
  type: string;
  manager: string;
  budget: number;
  attendees: number;
  notes: string;
  timezone: string;
}
export interface Equipment {
  id: string;
  name: string;
  category: string;
  sku: string;
  quantity: number;
  maintenance: number;
  rate: number;
  description: string;
}
export interface QuoteLine {
  id: string;
  equipmentId?: string;
  description: string;
  quantity: number;
  rate: number;
  days: number;
}
export type ProposalStatus =
  | "Draft"
  | "In review"
  | "Ready to send"
  | "Issued"
  | "Accepted"
  | "Declined"
  | "Superseded";
export interface Proposal {
  id: string;
  number: string;
  eventId: string;
  version: number;
  title: string;
  introduction: string;
  terms: string;
  lines: QuoteLine[];
  discount: number;
  tax: number;
  status: ProposalStatus;
  validUntil: string;
  acceptedAt?: string;
  aiReview?: {
    brief: string;
    assumptions: string[];
    questions: string[];
    generatedAt: string;
    model: string;
  };
}
export interface Message {
  id: string;
  direction: "in" | "out";
  text: string;
  at: string;
  proposalId?: string;
  proposalVersion?: number;
  status:
    | "Received"
    | "Sample sent"
    | "Draft"
    | "Queued"
    | "Sent"
    | "Delivered"
    | "Failed";
  channel?: string;
  createdBy?: string;
  approvedBy?: string;
  approvedAt?: string;
  sentAt?: string;
  providerMessageId?: string;
  failureReason?: string;
}
export interface Conversation {
  id: string;
  clientId: string;
  eventId: string;
  messages: Message[];
  review:
    | "Pending"
    | "Needs linking"
    | "Confirmed"
    | "Clarification needed"
    | "Not accepted"
    | "None";
  proposalId?: string;
  proposalVersion?: number;
  reviewMessageId?: string;
  acceptanceEvidence?: {
    messageId: string;
    proposalId: string;
    proposalVersion: number;
    decidedAt: string;
    ownerId?: string;
  };
}
export interface Task {
  id: string;
  eventId: string;
  title: string;
  assignee: string;
  assigneeId?: string;
  role: string;
  date: string;
  done: boolean;
  phase: string;
}
export interface Reservation {
  id: string;
  eventId: string;
  equipmentId: string;
  quantity: number;
  start: string;
  end: string;
  status: "Hold" | "Confirmed" | "Dispatched" | "Returned" | "Cancelled";
}
export type ObjectKind =
  | "Stage"
  | "Table"
  | "Chair"
  | "Booth"
  | "LED wall"
  | "Speaker"
  | "Light"
  | "Truss"
  | "Exit"
  | "Screen"
  | "Decoration";
export interface LayoutObject {
  id: string;
  kind: ObjectKind;
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  rotation: number;
  label: string;
  layer: string;
  equipmentId?: string;
  equipmentQuantity?: number;
  surfaceColor?: string;
  surfaceLabel?: string;
}
export interface LayoutReference {
  name: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  dataUrl: string;
  intrinsicWidth: number;
  intrinsicHeight: number;
  opacity: number;
  calibratedAt?: string;
}
export interface LayoutCamera {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  createdAt: string;
}
export interface Layout {
  id: string;
  eventId: string;
  name: string;
  version: number;
  width: number;
  depth: number;
  objects: LayoutObject[];
  verified: boolean;
  verifiedAt?: string;
  verificationNote?: string;
  reference?: LayoutReference;
  cameras?: LayoutCamera[];
  history: {
    version: number;
    objects: LayoutObject[];
    savedAt: string;
    width?: number;
    depth?: number;
    verified?: boolean;
    verifiedAt?: string;
    verificationNote?: string;
    cameras?: LayoutCamera[];
  }[];
}
export interface Activity {
  id: string;
  title: string;
  detail: string;
  at: string;
  eventId?: string;
}
export interface Workspace {
  schema: 1;
  clients: Client[];
  venues: Venue[];
  events: ProductionEvent[];
  equipment: Equipment[];
  proposals: Proposal[];
  conversations: Conversation[];
  tasks: Task[];
  reservations: Reservation[];
  layouts: Layout[];
  activity: Activity[];
  settings: {
    company: string;
    currency: string;
    timezone: string;
    email: string;
    notifications: boolean;
  };
}
