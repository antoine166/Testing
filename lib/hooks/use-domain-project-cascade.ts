"use client";

import { useCallback, useState } from "react";

type ProjectWithDomain = { id: string; domain_id: string | null };

/**
 * Domain + project selection with GTD-style cascade, shared by every task
 * create/edit surface: picking a domain narrows the project list to that
 * domain (clearing the current project if it no longer belongs there), and
 * picking a project jumps the domain to match it automatically — a
 * project always belongs to exactly one domain, so the two pickers should
 * never end up disagreeing.
 *
 * The returned setters are memoized (stable unless `allProjects` itself
 * changes identity) so callers can safely use them inside other
 * useCallback/useEffect functions without tripping exhaustive-deps.
 */
export function useDomainProjectCascade<P extends ProjectWithDomain>(
  allProjects: P[],
  initialDomainId = "",
  initialProjectId = "",
) {
  const [domainId, setDomainIdState] = useState(initialDomainId);
  const [projectId, setProjectIdState] = useState(initialProjectId);

  const setDomainId = useCallback(
    (newDomainId: string) => {
      setDomainIdState(newDomainId);
      if (newDomainId) {
        setProjectIdState((prevProjectId) => {
          if (!prevProjectId) return prevProjectId;
          const current = allProjects.find((p) => p.id === prevProjectId);
          return !current || current.domain_id !== newDomainId ? "" : prevProjectId;
        });
      }
    },
    [allProjects],
  );

  const setProjectId = useCallback(
    (newProjectId: string) => {
      setProjectIdState(newProjectId);
      if (newProjectId) {
        const project = allProjects.find((p) => p.id === newProjectId);
        if (project?.domain_id) setDomainIdState(project.domain_id);
      }
    },
    [allProjects],
  );

  const reset = useCallback((newDomainId = "", newProjectId = "") => {
    setDomainIdState(newDomainId);
    setProjectIdState(newProjectId);
  }, []);

  const filteredProjects = domainId ? allProjects.filter((p) => p.domain_id === domainId) : allProjects;

  return { domainId, projectId, setDomainId, setProjectId, filteredProjects, reset };
}
