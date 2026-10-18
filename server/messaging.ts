export interface OutgoingMessageRequest {
  idempotencyKey: string;
  recipient: string;
  text: string;
  conversationId: string;
  proposalId?: string;
  proposalVersion?: number;
}

export interface MessageTransport {
  label: string;
  send(
    message: OutgoingMessageRequest,
  ): Promise<{ externalId: string; status: "Sent" | "Delivered" }>;
}

export interface VerifiedInboundMessage {
  externalId: string;
  channel: string;
  conversationId: string;
  text: string;
  receivedAt: string;
  acceptanceSignal: boolean;
  proposalId?: string;
  proposalVersion?: number;
}

export function ingestInboundMessage(
  workspace: Workspace,
  inbound: VerifiedInboundMessage,
): { workspace: Workspace; duplicate: boolean; needsLinking: boolean } {
  if (
    workspace.conversations.some((conversation) =>
      conversation.messages.some(
        (message) => message.providerMessageId === inbound.externalId,
      ),
    )
  )
    return { workspace, duplicate: true, needsLinking: false };
  const next = structuredClone(workspace);
  const conversation = next.conversations.find(
    (item) => item.id === inbound.conversationId,
  );
  if (!conversation)
    throw new HttpError(
      422,
      "El mensaje entrante no coincide con una conversación.",
    );
  const exactOffer = Boolean(
    inbound.proposalId &&
    inbound.proposalVersion &&
    inbound.proposalId === conversation.proposalId &&
    inbound.proposalVersion === conversation.proposalVersion,
  );
  const message = {
    id: randomUUID(),
    direction: "in" as const,
    text: inbound.text,
    at: inbound.receivedAt,
    status: "Received" as const,
    channel: inbound.channel,
    providerMessageId: inbound.externalId,
    ...(inbound.proposalId
      ? {
          proposalId: inbound.proposalId,
          proposalVersion: inbound.proposalVersion,
        }
      : {}),
  };
  conversation.messages.push(message);
  const needsLinking = inbound.acceptanceSignal && !exactOffer;
  if (inbound.acceptanceSignal && conversation.review !== "Pending") {
    conversation.review = exactOffer ? "Pending" : "Needs linking";
    conversation.reviewMessageId = message.id;
  }
  return { workspace: next, duplicate: false, needsLinking };
}
import { randomUUID } from "node:crypto";
import type { Workspace } from "../src/shared/types";
import { HttpError } from "./database";
