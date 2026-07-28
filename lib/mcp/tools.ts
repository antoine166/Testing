import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AdminClient } from "@/lib/mcp/shared";
import { registerDomainContextTools } from "@/lib/mcp/tools/domains-contexts";
import { registerProjectTools } from "@/lib/mcp/tools/projects";
import { registerTaskTools } from "@/lib/mcp/tools/tasks";
import { registerPeopleSearchTools } from "@/lib/mcp/tools/people-search";
import { registerTaskCrudTools } from "@/lib/mcp/tools/task-crud";
import { registerTaskConversionTools } from "@/lib/mcp/tools/task-conversions";
import { registerRecurringTaskTools } from "@/lib/mcp/tools/recurring-tasks";
import { registerHabitTools } from "@/lib/mcp/tools/habits";
import { registerWorkoutTools } from "@/lib/mcp/tools/workouts";
import { registerCheckinTools } from "@/lib/mcp/tools/checkins";
import { registerRoutineTools } from "@/lib/mcp/tools/routines";
import { registerChecklistTools } from "@/lib/mcp/tools/checklists";
import { registerTicklerTools } from "@/lib/mcp/tools/tickler";
import { registerKnowledgeTools } from "@/lib/mcp/tools/knowledge";
import { registerAgendaTools } from "@/lib/mcp/tools/agenda";
import { registerHorizonTools } from "@/lib/mcp/tools/horizons";
import { registerTrashTools } from "@/lib/mcp/tools/trash";
import { registerCoachingTools } from "@/lib/mcp/tools/coaching";

/** Builds a fresh McpServer wired to a single Life OS account. One per request — no shared state between calls. */
export function buildMcpServer(admin: AdminClient, userId: string): McpServer {
  const server = new McpServer({ name: "life-os", version: "1.0.0" });

  registerDomainContextTools(server, admin, userId);
  registerProjectTools(server, admin, userId);
  registerTaskTools(server, admin, userId);
  registerPeopleSearchTools(server, admin, userId);
  registerTaskCrudTools(server, admin, userId);
  registerTaskConversionTools(server, admin, userId);
  registerRecurringTaskTools(server, admin, userId);
  registerHabitTools(server, admin, userId);
  registerWorkoutTools(server, admin, userId);
  registerCheckinTools(server, admin, userId);
  registerRoutineTools(server, admin, userId);
  registerChecklistTools(server, admin, userId);
  registerTicklerTools(server, admin, userId);
  registerKnowledgeTools(server, admin, userId);
  registerAgendaTools(server, admin, userId);
  registerHorizonTools(server, admin, userId);
  registerTrashTools(server, admin, userId);
  registerCoachingTools(server, admin, userId);

  return server;
}
