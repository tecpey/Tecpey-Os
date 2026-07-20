import type { PoolClient } from "pg";
import {
  collectAcademySignals,
  collectConversationSignals,
  collectTradingSignals,
  computeMentorProfileUpdate,
  type MentorProfileUpdate,
} from "./mentor-signals";

export async function computeMentorProfileForStudent(
  studentId: string,
): Promise<MentorProfileUpdate> {
  const [academy, trading, conversation] = await Promise.all([
    collectAcademySignals(studentId),
    collectTradingSignals(studentId),
    collectConversationSignals(studentId),
  ]);
  return computeMentorProfileUpdate(academy, trading, conversation);
}

export async function upsertMentorProfileUpdateTx(
  client: PoolClient,
  studentId: string,
  update: MentorProfileUpdate,
): Promise<void> {
  const result = await client.query(
    `INSERT INTO mentor_profiles
       (student_id, level, risk_profile, primary_goal, weak_areas, strong_areas,
        confidence_score, discipline_score, learning_style, last_active_at, updated_at)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
     ON CONFLICT (student_id) DO UPDATE SET
       level = EXCLUDED.level,
       risk_profile = EXCLUDED.risk_profile,
       primary_goal = EXCLUDED.primary_goal,
       weak_areas = EXCLUDED.weak_areas,
       strong_areas = EXCLUDED.strong_areas,
       confidence_score = EXCLUDED.confidence_score,
       discipline_score = EXCLUDED.discipline_score,
       learning_style = EXCLUDED.learning_style,
       last_active_at = NOW(),
       updated_at = NOW()
     RETURNING student_id`,
    [
      studentId,
      update.level,
      update.riskProfile,
      update.primaryGoal,
      update.weakAreas,
      update.strongAreas,
      update.confidenceScore,
      update.disciplineScore,
      update.learningStyle,
    ],
  );
  if ((result.rowCount ?? 0) !== 1) {
    throw new Error("mentor_profile_upsert_failed");
  }
}
