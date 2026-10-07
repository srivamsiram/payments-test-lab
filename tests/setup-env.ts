// Runs before every test file (before any module imports `src/config`).
process.env.LOG_LEVEL ??= 'silent';
process.env.KAFKAJS_NO_PARTITIONER_WARNING ??= '1';
