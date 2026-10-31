export type Actor = string | { id: string; name: string; email: string };
export function actorStamp(actor: Actor) {
  if (typeof actor !== "string") return { actor: actor.email, actorId: actor.id, actorName: actor.name };
  return { actor, actorId: actor === "scheduler" ? "system:cron" : null, actorName: actor === "scheduler" ? "Đồng bộ tự động" : actor };
}
export function createdStamp(actor: Actor) {
  const a = actorStamp(actor);
  return { createdById: a.actorId, createdByName: a.actorName };
}
export function updatedStamp(actor: Actor) {
  const a = actorStamp(actor);
  return { updatedById: a.actorId, updatedByName: a.actorName };
}
