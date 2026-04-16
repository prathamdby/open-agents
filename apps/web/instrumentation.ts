export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }
  if (process.env.WORKFLOW_WORKER === "0") {
    return;
  }

  const { getWorld } = await import("workflow/runtime");
  await getWorld().start?.();
}
