/**
 * The #125 project-completion celebration — triple expanding rings + a big
 * 🎉 pop (~1.8s, keyframes in globals.css), played over whatever card or
 * header represents the project. One shared copy for every surface that can
 * complete a project: ProjectCard, the project detail header, and the
 * project-filtered Tasks view's toolbar. The parent must be
 * `position: relative` and add `project-celebrate-card` for the green flash.
 */
export const PROJECT_CELEBRATE_MS = 1800;

export default function ProjectCelebration() {
  return (
    <span className="pointer-events-none absolute inset-0 z-10 overflow-visible">
      <span className="project-celebrate-ring" />
      <span className="project-celebrate-ring project-celebrate-ring-2" />
      <span className="project-celebrate-ring project-celebrate-ring-3" />
      <span className="project-celebrate-emoji absolute inset-0 flex items-center justify-center text-5xl">
        🎉
      </span>
    </span>
  );
}
