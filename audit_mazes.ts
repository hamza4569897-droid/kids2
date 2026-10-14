import { ALL_WORKSHEETS } from './src/data/worksheets/index';

const mazes = ALL_WORKSHEETS.filter(
  (w) => w.activityType === 'maze' || w.activityTypeLabel.includes('متاه')
);

console.log('Total maze worksheets found:', mazes.length);

mazes.forEach((m, idx) => {
  console.log(`\n[MAZE ${idx + 1}] ID: ${m.id} | Title: ${m.title} | Age: ${m.ageGroup}`);
  console.log(`  Objective: ${m.objective}`);
  console.log(`  Questions: ${m.questions.length}`);
  m.questions.forEach((q) => {
    console.log(`    - Prompt: ${q.prompt}`);
    if (q.options) {
      console.log('      Options:', q.options.map((o) => `${o.label} (correct: ${Boolean(o.isCorrect)})`).join(', '));
    }
  });
  if (m.assessmentGuide) {
    console.log('  Teacher/Parent Guide AnswerKey:', m.assessmentGuide.answerKey);
  }
});
