export const WITHDRAWAL_QUEUE_NAMES = Object.freeze({
  execution: "withdrawal",
  confirmation: "withdrawal-confirmation",
  recovery: "withdrawal-recovery",
  retry: "withdrawal-retry",
  deadLetter: "withdrawal-dlq",
});
