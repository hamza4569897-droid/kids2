import { AGE_BRACKETS, matchesAgeBracket, classifyDiscoveredApp } from './src/lib/sync/classifier.ts';
import { evaluateAutoPublish } from './src/lib/sync/gatekeeper.ts';
import { executeSyncForSource, executeSyncAllActiveSources } from './src/lib/sync/syncEngine.ts';
import { getResources, getCandidates, getSyncRuns, getTrustedSources } from './src/lib/storage.ts';

async function runTests() {
  console.log('--- STARTING SYNC & CLASSIFICATION TESTS ---');

  // Test 1: Age Classification & Multi-Bracket Support
  console.log('\n[TEST 1] Age Brackets & Coverage:');
  const appCoveringAll = { age_min: 2, age_max: 6 };
  const matches2_3 = matchesAgeBracket(appCoveringAll, '2-3');
  const matches3_4 = matchesAgeBracket(appCoveringAll, '3-4');
  const matches4_5 = matchesAgeBracket(appCoveringAll, '4-5');
  const matches5_6 = matchesAgeBracket(appCoveringAll, '5-6');
  console.log('App covering 2-6 matches: 2-3:', matches2_3, '| 3-4:', matches3_4, '| 4-5:', matches4_5, '| 5-6:', matches5_6);
  if (!matches2_3 || !matches3_4 || !matches4_5 || !matches5_6) {
    throw new Error('Test 1 Failed: App 2-6 must match all 4 brackets');
  }

  // Test 2: Multi-Category Classification
  console.log('\n[TEST 2] Multi-Category Auto-Classification:');
  const sampleMathAndColors = {
    external_id: 'test-math-colors',
    title_en: 'Math, Counting & Colorful Shapes Safari',
    title_ar: 'سفاري الحساب والعد والأشكال الملونة',
    description_en: 'Count numbers up to 10 and match geometric shapes with bright colors.',
    url: 'https://learn.khanacademy.org/math-colors',
    developer_name: 'Khan Academy Kids',
    declared_age_min: 2,
    declared_age_max: 4,
    declared_age_text: 'Ages 2 to 4',
    raw_tags: ['math', 'numbers', 'counting', 'shapes', 'colors'],
    is_free: true,
  };
  const classResult = classifyDiscoveredApp(sampleMathAndColors);
  console.log('Primary category:', classResult.categoryId, '(', classResult.categoryTitleAr, ')');
  console.log('Additional categories:', classResult.additionalCategories);
  console.log('Age verification evidence:', classResult.ageVerificationEvidence);
  console.log('Learning objectives count:', classResult.learningObjectives.length);

  if (!classResult.additionalCategories.includes('cat-colors-shapes')) {
    throw new Error('Test 2 Failed: Expected cat-colors-shapes in additional categories');
  }

  // Test 3: Uncertain Age Handling (Must Route to Candidates, Not Auto-Publish)
  console.log('\n[TEST 3] Uncertain Age Handling:');
  const uncertainAgeApp = {
    external_id: 'test-uncertain',
    title_en: 'Fun Preschool Puzzle',
    url: 'https://pbskids.org/puzzles',
    developer_name: 'PBS KIDS',
    raw_tags: ['puzzle', 'logic'],
    is_free: true,
  };
  const uncertainResult = classifyDiscoveredApp(uncertainAgeApp);
  console.log('isAgeUncertain:', uncertainResult.isAgeUncertain);
  const dummySource = {
    id: 'src-pbs-kids',
    name: 'PBS KIDS',
    slug: 'pbs-kids',
    base_url: 'https://pbskids.org',
    source_type: 'rss',
    is_active: true,
    requires_parent_gate: true,
    allowed_domains: ['pbskids.org'],
    licensing_terms_summary: 'شروط استخدام تعليمية غير ربحية',
    created_at: '',
    updated_at: '',
  };
  const evalResult = evaluateAutoPublish(uncertainAgeApp, uncertainResult, dummySource);
  console.log('canAutoPublish for uncertain age:', evalResult.canAutoPublish);
  console.log('Reason:', evalResult.reason);
  if (evalResult.canAutoPublish) {
    throw new Error('Test 3 Failed: Apps with uncertain age must NOT auto-publish');
  }

  // Test 4: Full Source Sync Execution
  console.log('\n[TEST 4] Execute Source Sync for Khan Academy Kids:');
  const syncResult = await executeSyncForSource('src-khan-kids', 'admin@littlestars.local');
  console.log('Sync Result:', {
    source: syncResult.sourceName,
    status: syncResult.status,
    itemsFound: syncResult.itemsFound,
    itemsNew: syncResult.itemsNew,
    itemsImported: syncResult.itemsImported,
    itemsFlagged: syncResult.itemsFlaggedForReview,
    duplicatesIgnored: syncResult.itemsDuplicatesIgnored,
  });

  // Test 5: Re-running Sync (Deduplication Check)
  console.log('\n[TEST 5] Re-run Sync (Checking Deduplication):');
  const syncRerun = await executeSyncForSource('src-khan-kids', 'admin@littlestars.local');
  console.log('Re-run Sync Result:', {
    itemsFound: syncRerun.itemsFound,
    itemsNew: syncRerun.itemsNew,
    duplicatesIgnored: syncRerun.itemsDuplicatesIgnored,
  });
  if (syncRerun.itemsNew > 0) {
    throw new Error('Test 5 Failed: Re-running sync must not re-import duplicates');
  }

  console.log('\n--- ALL SYNC & DISCOVERY ENGINE TESTS PASSED SUCCESSFULLY! ---');
}

runTests().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
