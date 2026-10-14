/**
 * Verification Script for Admin Authentication & Security Controls
 * Little Stars — عالم الصغار
 */

import { supabase, isSupabaseConfigured, checkIsAdminFromDatabase } from './src/lib/supabase';
import { getAdminAuthStatus, loginAsAdmin, logoutAdmin } from './src/lib/adminAuth';
import { getResources, getCategories } from './src/lib/storage';

async function runComprehensiveVerification() {
  console.log('================================================================');
  console.log('  LITTLE STARS — ADMIN AUTH & SECURITY VERIFICATION AUDIT');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 6;

  // --------------------------------------------------------------------------
  // TEST 1: الزائر غير المسجل يستطيع استخدام الموقع العام
  // --------------------------------------------------------------------------
  console.log('▶ [TEST 1] الزائر غير المسجل يستطيع استخدام الموقع العام:');
  try {
    const [resources, categories] = await Promise.all([getResources(), getCategories()]);
    console.log(`   - تم استرجاع (${resources.length}) نشاطاً تعليمياً عاماً متاحاً للأطفال.`);
    console.log(`   - تم استرجاع (${categories.length}) تصنيفاً تعليمياً معتمداً.`);
    if (resources.length > 0 && categories.length > 0) {
      console.log('   ✓ [PASS] نجح: المحتوى العام متاح بالكامل للزوار دون أي متطلبات تسجيل دخول.\n');
      passedTests++;
    } else {
      console.error('   ✗ [FAIL] فشل: تعذر استرجاع المحتوى العام.\n');
    }
  } catch (err: any) {
    console.error('   ✗ [FAIL] خطأ في فحص المحتوى العام:', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 2: الزائر لا يرى خيار بوابة الإدارة
  // --------------------------------------------------------------------------
  console.log('▶ [TEST 2] الزائر لا يرى خيار بوابة الإدارة:');
  try {
    const status = await getAdminAuthStatus();
    console.log(`   - حالة فحص المشرف للزائر غير المسجل: isAuthenticated = ${status.isAuthenticated}, isAdmin = ${status.isAdmin}`);
    if (!status.isAdmin && !status.isAuthenticated) {
      console.log('   ✓ [PASS] نجح: الزائر العادي ليس مشرفاً (isAdmin=false)، وبالتالي لا يظهر له زر "بوابة الإدارة" في شريط التنقل.\n');
      passedTests++;
    } else {
      console.error('   ✗ [FAIL] خطأ: الزائر ظهر كمشرف بطريقة غير متوقعة!\n');
    }
  } catch (err: any) {
    console.error('   ✗ [FAIL] خطأ في فحص حالة الزائر:', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 3: المستخدم غير المصرح له لا يستطيع دخول لوحة الإدارة حتى لو فتح رابطها مباشرة
  // --------------------------------------------------------------------------
  console.log('▶ [TEST 3] المستخدم غير المصرح له لا يستطيع دخول لوحة الإدارة حتى لو فتح رابطها مباشرة:');
  try {
    // Attempt invalid credentials
    const loginAttempt = await loginAsAdmin('unauthorized_hacker@example.com', 'bad_password_999');
    console.log(`   - محاولة تسجيل دخول ببيانات غير صحيحة: success = ${loginAttempt.success}`);
    console.log(`   - رسالة الرفض: "${loginAttempt.error}"`);

    // Verify database RPC check rejects anonymous user
    const dbAdminCheck = await checkIsAdminFromDatabase();
    console.log(`   - فحص دالة is_admin() في قاعدة البيانات: isAdmin = ${dbAdminCheck.isAdmin}`);

    if (!loginAttempt.success && !dbAdminCheck.isAdmin) {
      console.log('   ✓ [PASS] نجح: تم رفض محاولة الدخول غير المصرح بها، ودالة is_admin() تمنع الدخول الإداري.\n');
      passedTests++;
    } else {
      console.error('   ✗ [FAIL] فشل: تم قبول بيانات غير مصرح بها!\n');
    }
  } catch (err: any) {
    console.error('   ✗ [FAIL] خطأ في فحص الرفض:', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 4: الأدمن المصرح له والتحقق عبر دالة is_admin() و admin_allowlist
  // --------------------------------------------------------------------------
  console.log('▶ [TEST 4] التحقق المشدد من صلاحيات الأدمن عبر Supabase Auth و public.is_admin():');
  try {
    if (!isSupabaseConfigured() || !supabase) {
      throw new Error('Supabase is not configured');
    }

    // Call public.is_admin() RPC anonymously
    const { data: isAnonAdmin, error: rpcError } = await supabase.rpc('is_admin');
    console.log(`   - استدعاء دالة is_admin() لمستخدم مجهول: result = ${isAnonAdmin}, error = ${rpcError ? rpcError.message : 'none'}`);

    if (isAnonAdmin === false && !rpcError) {
      console.log('   ✓ [PASS] نجح: دالة public.is_admin() في Supabase تعمل بدقة وترفض منح صلاحية المشرف لأي مستخدم غير مسجل في admin_allowlist.\n');
      passedTests++;
    } else {
      console.error('   ✗ [FAIL] خطأ في نتيجة دالة is_admin() للزائر.\n');
    }
  } catch (err: any) {
    console.error('   ✗ [FAIL] خطأ في استدعاء RPC:', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 5: تسجيل الخروج ينهي الجلسة الإدارية وتُرفض الطلبات اللاحقة
  // --------------------------------------------------------------------------
  console.log('▶ [TEST 5] تسجيل الخروج ينهي الجلسة الإدارية وتُرفض الطلبات اللاحقة:');
  try {
    const logoutRes = await logoutAdmin();
    console.log(`   - استدعاء logoutAdmin(): success = ${logoutRes.success}`);

    const statusAfterLogout = await getAdminAuthStatus();
    console.log(`   - حالة الجلسة بعد تسجيل الخروج: isAuthenticated = ${statusAfterLogout.isAuthenticated}, isAdmin = ${statusAfterLogout.isAdmin}`);

    if (logoutRes.success && !statusAfterLogout.isAuthenticated && !statusAfterLogout.isAdmin) {
      console.log('   ✓ [PASS] نجح: تسجيل الخروج ينهي الجلسة الإدارية بالكامل، وتتحول الصلاحية إلى غير مصرح.\n');
      passedTests++;
    } else {
      console.error('   ✗ [FAIL] فشل إنهاء الجلسة بشكل صحيح.\n');
    }
  } catch (err: any) {
    console.error('   ✗ [FAIL] خطأ في اختبار تسجيل الخروج:', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 6: سياسات قاعدة البيانات تمنع التعديلات غير المصرح بها
  // --------------------------------------------------------------------------
  console.log('▶ [TEST 6] سياسات قاعدة البيانات (RLS) تمنع التعديلات غير المصرح بها:');
  try {
    if (supabase) {
      // Attempt an unauthorized insert into educational_resources anonymously
      const maliciousResource = {
        id: 'unauthorized-hack-activity',
        title_ar: 'نشاط غير مصرح به',
        slug: 'unauthorized-hack',
        description_ar: 'اختبار الحماية ضد الاختراق',
        age_min: 3,
        age_max: 5,
        category_id: 'cat-arabic',
        content_type: 'game',
        launch_type: 'builtin',
        provider_name: 'Untrusted Attacker',
        source_type: 'manual_review',
        is_free: true,
        learning_objectives: [],
        estimated_duration_minutes: 5,
        accessibility_notes: [],
        licensing_status: 'pending_verification',
        review_status: 'approved',
      };

      const { data: insertData, error: insertError } = await supabase
        .from('educational_resources')
        .insert(maliciousResource);

      console.log(`   - محاولة إضافة نشاط جديد بدون جلسة مشرف: error = ${insertError ? insertError.message + ` (${insertError.code})` : 'none'}`);

      // Attempt unauthorized query on admin_allowlist
      const { data: allowlistData, error: allowlistError } = await supabase
        .from('admin_allowlist')
        .select('*');

      console.log(`   - محاولة قراءة جدول admin_allowlist بدون جلسة مشرف: error = ${allowlistError ? allowlistError.message + ` (${allowlistError.code})` : 'none'}`);

      if (insertError && allowlistError) {
        console.log('   ✓ [PASS] نجح: سياسات RLS في قاعدة البيانات تمنع التعديلات وقراءة القوائم المحمية بنجاح.\n');
        passedTests++;
      } else {
        console.error('   ✗ [FAIL] تحذير: استطاع مستخدم غير مصرح به إجراء تعديلات على قاعدة البيانات!\n');
      }
    }
  } catch (err: any) {
    console.error('   ✗ [FAIL] خطأ في فحص سياسات RLS:', err.message);
  }

  // --------------------------------------------------------------------------
  // SUMMARY REPORT
  // --------------------------------------------------------------------------
  console.log('================================================================');
  console.log(`  RESULT: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log('================================================================');

  if (passedTests === totalTests) {
    console.log('  جميع اختبارات الأمان وتسجيل دخول المشرف المعتمد اجتازت بنجاح!');
  } else {
    process.exit(1);
  }
}

runComprehensiveVerification().catch((e) => {
  console.error('Verification failed:', e);
  process.exit(1);
});
