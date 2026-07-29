/**
 * Knowledge Graph — prerequisite mapping for Academy Term 1 concepts.
 *
 * Nodes represent concept IDs (matching QuizQuestion.conceptTag in term1Curriculum.ts).
 * Directed edges represent "A must be understood before B" relationships.
 *
 * If a student fails on concept B, the graph finds which prerequisite concepts
 * to recommend reviewing first.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConceptNode = {
  id: string;
  label: string;
  termNumber: number;
  lessonIndex: number;
  weight: number;          // importance weight 1–10
};

export type ConceptEdge = {
  from: string;            // prerequisite concept ID
  to: string;              // dependent concept ID
};

export type ConceptRecommendation = {
  conceptId: string;
  label: string;
  lessonIndex: number;
  reason: string;
  priority: number;        // 1 = highest
};

// ─── Graph data ───────────────────────────────────────────────────────────────

export const CONCEPT_NODES: ConceptNode[] = [
  // Term 1, Lesson 1 — پول، اعتماد و مسئله واسطه
  { id: "money-definition",        label: "تعریف پول",                    termNumber: 1, lessonIndex: 1, weight: 10 },
  { id: "crypto-responsibility",   label: "مسئولیت در رمزارز",            termNumber: 1, lessonIndex: 1, weight: 8  },

  // Term 1, Lesson 2 — بیت‌کوین: چرا و چگونه
  { id: "bitcoin-purpose",         label: "هدف بیت‌کوین",                 termNumber: 1, lessonIndex: 2, weight: 9  },
  { id: "bitcoin-supply",          label: "عرضه محدود بیت‌کوین",          termNumber: 1, lessonIndex: 2, weight: 8  },
  { id: "scarcity-vs-price",       label: "کمیابی در برابر قیمت",         termNumber: 1, lessonIndex: 2, weight: 9  },
  { id: "decentralization",        label: "غیرمتمرکز بودن",              termNumber: 1, lessonIndex: 2, weight: 8  },
  { id: "responsible-buying",      label: "خرید مسئولانه",               termNumber: 1, lessonIndex: 2, weight: 10 },

  // Term 1, Lesson 3 — بلاکچین به زبان ساده
  { id: "blockchain-immutability", label: "تغییرناپذیری بلاکچین",        termNumber: 1, lessonIndex: 3, weight: 9  },
  { id: "blockchain-security",     label: "امنیت بلاکچین",               termNumber: 1, lessonIndex: 3, weight: 8  },
  { id: "blockchain-vs-quality",   label: "بلاکچین در مقابل کیفیت پروژه", termNumber: 1, lessonIndex: 3, weight: 9 },
  { id: "transaction-lifecycle",   label: "چرخه حیات تراکنش",            termNumber: 1, lessonIndex: 3, weight: 7  },
  { id: "project-evaluation",      label: "ارزیابی پروژه",               termNumber: 1, lessonIndex: 3, weight: 9  },
];

export const CONCEPT_EDGES: ConceptEdge[] = [
  // Lesson 1 concepts build on each other
  { from: "money-definition",        to: "crypto-responsibility"   },

  // Lesson 2 builds on lesson 1
  { from: "money-definition",        to: "bitcoin-purpose"         },
  { from: "money-definition",        to: "bitcoin-supply"          },
  { from: "bitcoin-supply",          to: "scarcity-vs-price"       },
  { from: "crypto-responsibility",   to: "decentralization"        },
  { from: "scarcity-vs-price",       to: "responsible-buying"      },
  { from: "crypto-responsibility",   to: "responsible-buying"      },

  // Lesson 3 builds on lesson 2
  { from: "decentralization",        to: "blockchain-immutability" },
  { from: "blockchain-immutability", to: "blockchain-security"     },
  { from: "blockchain-security",     to: "blockchain-vs-quality"   },
  { from: "decentralization",        to: "transaction-lifecycle"   },
  { from: "blockchain-immutability", to: "transaction-lifecycle"   },
  { from: "blockchain-vs-quality",   to: "project-evaluation"      },
  { from: "scarcity-vs-price",       to: "project-evaluation"      },
];

// ─── Graph queries ────────────────────────────────────────────────────────────

/** Build adjacency map: concept → direct prerequisites. */
function buildPrereqMap(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const node of CONCEPT_NODES) map.set(node.id, []);
  for (const edge of CONCEPT_EDGES) {
    const existing = map.get(edge.to) ?? [];
    map.set(edge.to, [...existing, edge.from]);
  }
  return map;
}

const PREREQ_MAP = buildPrereqMap();

/** Recursively find all prerequisite concepts for a given concept (BFS). */
export function findAllPrerequisites(conceptId: string, visited = new Set<string>()): string[] {
  if (visited.has(conceptId)) return [];
  visited.add(conceptId);
  const direct = PREREQ_MAP.get(conceptId) ?? [];
  const all: string[] = [...direct];
  for (const prereq of direct) {
    all.push(...findAllPrerequisites(prereq, visited));
  }
  return [...new Set(all)].filter((id) => id !== conceptId);
}

/** Get the ConceptNode for a given ID. */
export function getConceptNode(id: string): ConceptNode | undefined {
  return CONCEPT_NODES.find((n) => n.id === id);
}

/**
 * Given a set of failed concepts, recommend what to review first.
 * Returns a prioritized list of concept recommendations.
 */
export function getConceptRecommendations(
  failedConceptIds: string[],
  masteredConceptIds: string[],
): ConceptRecommendation[] {
  const masteredSet = new Set(masteredConceptIds);
  const recommendations = new Map<string, ConceptRecommendation>();

  for (const failed of failedConceptIds) {
    const prereqs = findAllPrerequisites(failed);
    const failedNode = getConceptNode(failed);

    // First: check if prerequisites are weak
    for (const prereqId of prereqs) {
      if (masteredSet.has(prereqId)) continue;
      const prereqNode = getConceptNode(prereqId);
      if (!prereqNode) continue;
      if (!recommendations.has(prereqId)) {
        recommendations.set(prereqId, {
          conceptId: prereqId,
          label: prereqNode.label,
          lessonIndex: prereqNode.lessonIndex,
          reason: `پیش‌نیاز مستقیم برای «${failedNode?.label ?? failed}»`,
          priority: 1,
        });
      }
    }

    // Also recommend the failed concept itself
    if (failedNode && !recommendations.has(failed)) {
      recommendations.set(failed, {
        conceptId: failed,
        label: failedNode.label,
        lessonIndex: failedNode.lessonIndex,
        reason: "نیاز به مرور و تقویت دارد",
        priority: 2,
      });
    }
  }

  return [...recommendations.values()]
    .sort((a, b) => a.priority - b.priority || a.lessonIndex - b.lessonIndex)
    .slice(0, 6);
}

/**
 * Given completed lesson indices, determine which concepts are likely mastered
 * and which are likely weak based on prerequisites.
 */
export function getConceptStatusMap(
  completedLessonIndices: number[],
  avgLessonScores: Record<number, number>,
): { mastered: string[]; weak: string[] } {
  const mastered: string[] = [];
  const weak: string[] = [];

  for (const node of CONCEPT_NODES) {
    const lessonScore = avgLessonScores[node.lessonIndex] ?? 0;
    const isCompleted = completedLessonIndices.includes(node.lessonIndex);
    if (isCompleted && lessonScore >= 80) {
      mastered.push(node.id);
    } else if (isCompleted && lessonScore < 80) {
      weak.push(node.id);
    }
  }

  return { mastered, weak };
}
