import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DerivedTask, Metrics, Task } from '@/types';
import {
  computeAverageROI,
  computePerformanceGrade,
  computeRevenuePerHour,
  computeTimeEfficiency,
  computeTotalRevenue,
  sortTasks,
  withDerived,
} from '@/utils/logic';

/* ---------------- CONSTANTS ---------------- */

const INITIAL_METRICS: Metrics = {
  totalRevenue: 0,
  totalTimeTaken: 0,
  timeEfficiencyPct: 0,
  revenuePerHour: 0,
  averageROI: 0,
  performanceGrade: 'Needs Improvement',
};

/* ---------------- HOOK ---------------- */

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastDeleted, setLastDeleted] = useState<Task | null>(null);

  /* ---------------- FETCH TASKS ---------------- */
  useEffect(() => {
    let cancelled = false;

    async function loadTasks() {
      try {
        const res = await fetch('/tasks.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to load tasks.json');

        const raw = (await res.json()) as Task[];

        if (cancelled) return;

        const normalized: Task[] = raw.map((t, index) => ({
          ...t,
          createdAt:
            t.createdAt ??
            new Date(Date.now() - (index + 1) * 86400000).toISOString(),
          completedAt:
            t.status === 'Done'
              ? t.completedAt ?? new Date().toISOString()
              : undefined,
        }));

        setTasks(normalized);
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Failed to load tasks');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadTasks();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------------- DERIVED DATA ---------------- */

  const derivedSorted = useMemo<DerivedTask[]>(() => {
    return sortTasks(tasks.map(withDerived));
  }, [tasks]);

  const metrics = useMemo<Metrics>(() => {
    if (!tasks.length) return INITIAL_METRICS;

    const totalRevenue = computeTotalRevenue(tasks);
    const totalTimeTaken = tasks.reduce((s, t) => s + t.timeTaken, 0);
    const timeEfficiencyPct = computeTimeEfficiency(tasks);
    const revenuePerHour = computeRevenuePerHour(tasks);
    const averageROI = computeAverageROI(tasks);

    return {
      totalRevenue,
      totalTimeTaken,
      timeEfficiencyPct,
      revenuePerHour,
      averageROI,
      performanceGrade: computePerformanceGrade(averageROI),
    };
  }, [tasks]);

  /* ---------------- ACTIONS ---------------- */

  const addTask = useCallback(
    (task: Omit<Task, 'id'> & { id?: string }) => {
      setTasks(prev => [
        ...prev,
        {
          ...task,
          id: task.id ?? crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          completedAt:
            task.status === 'Done'
              ? new Date().toISOString()
              : undefined,
        },
      ]);
    },
    []
  );

  const updateTask = useCallback((id: string, patch: Partial<Task>) => {
    setTasks(prev =>
      prev.map(t => {
        if (t.id !== id) return t;

        const updated = { ...t, ...patch };

        if (t.status !== 'Done' && updated.status === 'Done') {
          updated.completedAt = new Date().toISOString();
        }

        return updated;
      })
    );
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks(prev => {
      const target = prev.find(t => t.id === id) ?? null;
      setLastDeleted(target);
      return prev.filter(t => t.id !== id);
    });
  }, []);

  const undoDelete = useCallback(() => {
    if (!lastDeleted) return;
    setTasks(prev => [...prev, lastDeleted]);
    setLastDeleted(null);
  }, [lastDeleted]);

  const clearLastDeleted = useCallback(() => {
    setLastDeleted(null);
  }, []);

  /* ---------------- RETURN ---------------- */

  return {
    tasks,
    loading,
    error,
    derivedSorted,
    metrics,
    lastDeleted,
    addTask,
    updateTask,
    deleteTask,
    undoDelete,
    clearLastDeleted,
  };
}
