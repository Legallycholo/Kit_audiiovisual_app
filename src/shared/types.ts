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
export type ProposalTemplate = "Minimal" | "Editorial" | "Spotlight";
export interface ProposalVisual {
  id: string;
  sourceType: "Creative" | "Layout plan" | "Layout 3D";
  sourceId: string;
  sourceRevision: number;
  title: string;
  caption: string;
  altText: string;
  dataUrl: string;
  mimeType: "image/svg+xml" | "image/png" | "image/jpeg" | "image/webp";
  measurementStatus?: "Verified" | "Unverified";
  addedAt: string;
}
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
  creativeAssetIds?: string[];
  presentationTemplate?: ProposalTemplate;
  visualNarrative?: string;
  visuals?: ProposalVisual[];
  aiReview?: {
    brief: string;
    assumptions: string[];
    questions: string[];
    generatedAt: string;
    model: string;
  };
}
export type CreativeKind =
  | "Event concept"
  | "Stage concept"
  | "Lighting concept"
  | "Promotional visual"
  | "Image edit";
export type CreativeAssetStatus = "In review" | "Approved" | "Rejected";
export interface BrandAsset {
  id: string;
  eventId: string;
  name: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  dataUrl: string;
  rightsConfirmed: boolean;
  createdAt: string;
}
export interface CreativeAsset {
  id: string;
  eventId: string;
  kind: CreativeKind;
  title: string;
  brief: string;
  revision: number;
  parentId?: string;
  status: CreativeAssetStatus;
  dataUrl: string;
  mimeType: "image/svg+xml" | "image/png" | "image/jpeg" | "image/webp";
  referenceIds: string[];
  provider: string;
  model: string;
  generatedAt: string;
  usageUnits: number;
  estimatedCost: number;
  reviewedAt?: string;
  reviewNote?: string;
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
  source?: "Owned" | "Supplier";
  supplier?: string;
  supplierReference?: string;
  unitCost?: number;
  bufferBeforeDays?: number;
  bufferAfterDays?: number;
  dispatchedQuantity?: number;
  returnedQuantity?: number;
  damagedQuantity?: number;
  substituteEquipmentId?: string;
  custodyNote?: string;
}
export interface EquipmentPackage {
  id: string;
  name: string;
  description: string;
  active: boolean;
  items: { equipmentId: string; quantity: number }[];
}
export interface MaintenanceRecord {
  id: string;
  equipmentId: string;
  reservationId?: string;
  quantity: number;
  issue: string;
  status: "Open" | "In repair" | "Resolved";
  openedAt: string;
  resolvedAt?: string;
  cost: number;
}
export interface CrewShift {
  id: string;
  person: string;
  memberId?: string;
  role: string;
  start: string;
  end: string;
  status: "Scheduled" | "Completed" | "Cancelled";
  cost: number;
}
export interface RunCue {
  id: string;
  at: string;
  title: string;
  department: string;
  owner: string;
  notes: string;
  status: "Pending" | "Complete" | "Skipped";
}
export interface TransportAssignment {
  id: string;
  kind: "Outbound" | "Return";
  provider: string;
  vehicle: string;
  driver: string;
  departureAt: string;
  arrivalAt: string;
  status: "Planned" | "In transit" | "Complete" | "Cancelled";
  cost: number;
  notes: string;
}
export interface OnsiteChange {
  id: string;
  title: string;
  detail: string;
  impact: string;
  recordedAt: string;
  recordedBy: string;
  costImpact: number;
}
export interface ActualCost {
  id: string;
  category: "Crew" | "Transport" | "Supplier rental" | "Repair" | "Other";
  description: string;
  amount: number;
  incurredAt: string;
}
export interface EventOperations {
  id: string;
  eventId: string;
  crewShifts: CrewShift[];
  cues: RunCue[];
  transports: TransportAssignment[];
  changes: OnsiteChange[];
  costs: ActualCost[];
}
export type AutomationKind =
  "Proposal review" | "Preparation risk" | "Equipment return" | "Cost variance";
export interface AutomationRecord {
  id: string;
  key: string;
  eventId?: string;
  proposalId?: string;
  kind: AutomationKind;
  title: string;
  detail: string;
  dueAt: string;
  action: "Create task" | "Review only";
  status: "Open" | "Approved" | "Dismissed" | "Failed";
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  taskId?: string;
  failureReason?: string;
}
export type ObjectKind =
  | "Wall"
  | "Door"
  | "Window"
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
  source?: "Manual" | "Extracted";
  confidence?: number;
  reviewStatus?: "Suggested" | "Accepted" | "Corrected";
}
export interface LayoutReference {
  name: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  dataUrl: string;
  intrinsicWidth: number;
  intrinsicHeight: number;
  opacity: number;
  calibratedAt?: string;
  rightsConfirmed?: boolean;
  uploadedAt?: string;
  knownMeasurement?: number;
  ceilingHeight?: number;
  units?: "meters";
}
export interface LayoutCamera {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  createdAt: string;
}
export interface LayoutCameraPath {
  cameraIds: string[];
  durationSeconds: 15 | 30 | 60;
}
export interface LayoutProvenance {
  method: "Manual" | "Structured extraction";
  provider?: string;
  model?: string;
  requestId?: string;
  extractedAt?: string;
  reviewedAt?: string;
  sourceName?: string;
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
  cameraPath?: LayoutCameraPath;
  provenance?: LayoutProvenance;
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
    cameraPath?: LayoutCameraPath;
    provenance?: LayoutProvenance;
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
  packages: EquipmentPackage[];
  maintenanceRecords: MaintenanceRecord[];
  operations: EventOperations[];
  automations: AutomationRecord[];
  layouts: Layout[];
  brandAssets: BrandAsset[];
  creativeAssets: CreativeAsset[];
  activity: Activity[];
  settings: {
    company: string;
    currency: string;
    timezone: string;
    email: string;
    notifications: boolean;
  };
}
