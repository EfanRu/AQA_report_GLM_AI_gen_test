/**
 * Генератор демо-данных TestReport.
 *
 * Пишет в Postgres так же, как это будет делать Java-листенер автотестов
 * (прямая запись батчами по ходу прогона). Сценарий:
 *
 *   билд 2.7.0 (неделю назад)  — полный прогон CI (~4000 тестов) + реран упавших
 *   билд 2.8.0 (2 дня назад)   — полный прогон CI + локальный реран упавших (Дмитрий)
 *   билд 2.9.0 (сейчас)        — прогон CI ОБОРВАН на ~62%, finished_at = null
 *                                -> демонстрация «Отсутствующие тесты» и дельта-загрузки
 *
 * Режим --progress: дописывает следующую порцию результатов в незавершённый прогон
 * (имитация «двухчасовой прогон идёт») — после нажатия «Обновить» в UI появляются новые тесты.
 */
import crypto from 'node:crypto';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://testreport:testreport@localhost:5432/testreport';
const PROGRESS = process.argv.includes('--progress');

/* ------------------------------ детерминированный RNG ------------------------------ */

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261005);
const rint = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];

/* ------------------------------ каталог тестов ------------------------------ */

const DOMAINS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['auth', ['LoginTests', 'RegistrationTests', 'PasswordRecoveryTests', 'SessionTests']],
  ['checkout', ['CartTests', 'DeliveryOptionsTests', 'OrderSummaryTests', 'CheckoutFlowTests']],
  ['payments', ['CardPaymentTests', 'RefundTests', 'PaymentGatewayTests']],
  ['catalog', ['ProductSearchTests', 'ProductCardTests', 'FiltersTests', 'SortingTests']],
  ['orders', ['OrderHistoryTests', 'OrderDetailsTests', 'OrderCancellationTests']],
  ['profile', ['PersonalDataTests', 'NotificationSettingsTests', 'AddressBookTests']],
  ['promo', ['PromoCodeTests', 'DiscountCalculationTests']],
  ['loyalty', ['LoyaltyBalanceTests', 'BonusSpendingTests']],
  ['shipping', ['DeliveryCostTests', 'PickupPointTests']],
  ['admin', ['UserManagementTests', 'ContentPublishingTests']],
];

const ACTIONS = ['shouldDisplay', 'shouldCalculate', 'shouldAllow', 'shouldReject', 'shouldSend', 'shouldSave', 'shouldUpdate', 'shouldHide', 'shouldApply', 'shouldValidate'] as const;
const SUBJECTS = ['CorrectTotal', 'GuestUser', 'RegisteredUser', 'BlockedUser', 'EmptyCart', 'ExpiredSession', 'InvalidInput', 'LongValues', 'SpecialSymbols', 'MobileLayout', 'DesktopLayout', 'NetworkLatency', 'ConcurrentEdit', 'AfterRefresh', 'WithPromoCode', 'WithoutDelivery', 'PaidOrder', 'CanceledOrder', 'AdminRole', 'ViewerRole'] as const;

const PARAM_SETS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['locale', ['ru-RU', 'en-US']],
  ['currency', ['RUB', 'USD', 'EUR']],
  ['userType', ['standard', 'business']],
  ['channel', ['web', 'mobile-web']],
];

type Behaviour =
  | { kind: 'pass' }
  | { kind: 'fail'; template: number }
  | { kind: 'broken'; template: number }
  | { kind: 'skip' }
  | { kind: 'flaky'; template: number };

interface Def {
  className: string;
  methodName: string;
  params: Record<string, string> | null;
  paramsHash: string;
  paramsJson: string;
  tags: string[];
  behaviour: Behaviour;
}

// вес шаблонов падений: продуктовые и env чаще
const WEIGHTED: readonly number[] = [0, 0, 1, 2, 3, 3, 4, 5, 6, 8, 9];
function weightedTemplate(): number {
  return WEIGHTED[Math.floor(rnd() * WEIGHTED.length)];
}

function paramsHashOf(params: Record<string, string> | null): string {
  if (!params) return '';
  const canonical = JSON.stringify(Object.keys(params).sort().reduce<Record<string, string>>((acc, k) => { acc[k] = params[k]; return acc; }, {}));
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

function buildCatalog(target: number): Def[] {
  const defs: Def[] = [];
  const seen = new Set<string>();
  let domainIdx = 0;
  let classIdx = 0;
  let methodCounter = 0;

  outer: for (const def of iterateDefs()) {
    defs.push(def);
    if (defs.length >= target) break outer;
  }

  function* iterateDefs(): Generator<Def> {
    while (true) {
      const [domain, classes] = DOMAINS[domainIdx % DOMAINS.length];
      const pkg = `tests.${domain}`;
      const cls = classes[classIdx % classes.length];
      const className = `${pkg}.${cls}`;
      if (classIdx > 0 && classIdx % classes.length === 0) domainIdx++;
      classIdx++;

      for (let m = 0; m < 38; m++) {
        let methodName = `${pick(ACTIONS)}_${pick(SUBJECTS)}`;
        if (seen.has(`${className}.${methodName}`)) methodName += `_v${++methodCounter}`;
        seen.add(`${className}.${methodName}`);

        // каждый 6-й метод параметризованный: по 2 варианта значений
        if (rnd() < 1 / 6) {
          const [key, values] = pick(PARAM_SETS);
          for (const v of values.slice(0, 2)) {
            const params = { [key]: v };
            yield makeDef(className, methodName, params, domain);
          }
        } else {
          yield makeDef(className, methodName, null, domain);
        }
      }
    }
  }

  function makeDef(className: string, methodName: string, params: Record<string, string> | null, domain: string): Def {
    const epic = domain.charAt(0).toUpperCase() + domain.slice(1);
    const tags = [`epic:${epic}`];
    const rollTag = rnd();
    if (rollTag < 0.15) tags.push('smoke');
    else if (rollTag < 0.23) tags.push('critical');
    else if (rollTag < 0.85) tags.push('regress');

    // распределение поведения: основная масса зелёная, падения — по шаблонам
    const roll = rnd();
    let behaviour: Behaviour;
    if (roll < 0.935) behaviour = { kind: 'pass' };
    else if (roll < 0.97) behaviour = { kind: 'fail', template: weightedTemplate() };
    else if (roll < 0.981) behaviour = { kind: 'broken', template: weightedTemplate() };
    else if (roll < 0.995) behaviour = { kind: 'skip' };
    else behaviour = { kind: 'flaky', template: FLAKY_TEMPLATE };

    return {
      className,
      methodName,
      params,
      paramsHash: paramsHashOf(params),
      paramsJson: params ? JSON.stringify(params) : 'null',
      tags: tags.sort(),
      behaviour,
    };
  }

  return defs;
}

/* ------------------------------ шаблоны ошибок и комментарии ------------------------------ */

interface Template {
  category: 'product' | 'auto' | 'env' | 'flaky' | 'other';
  message: string;
  excClass: string;
  comment?: { body: string; author: string };
}

const FLAKY_TEMPLATE = 6;

const TEMPLATES: Template[] = [
  {
    category: 'env',
    message: 'Стенд stage2 недоступен: upstream timeout (502) от payment-gateway',
    excClass: 'org.openqa.selenium.TimeoutException',
    comment: {
      body: 'Перегружен payment-gateway на stage2: перезапустили контур вручную, ждём фикса от инфраструктуры (INFRA-482)',
      author: 'Дмитрий',
    },
  },
  {
    category: 'env',
    message: 'Таймаут ожидания ответа сервиса orders: 30s превышен',
    excClass: 'java.net.SocketTimeoutException',
    comment: {
      body: 'Сервис orders деградирует под вечерней нагрузкой, согласовали с командой сервиса — поставили на мониторинг',
      author: 'Игорь',
    },
  },
  {
    category: 'product',
    message: 'Итоговая сумма заказа не учитывает скидку промокода: ожидалось 1350.00, получено 1500.00',
    excClass: 'java.lang.AssertionError',
    comment: {
      body: 'Дефект PRODUCT-1123: промокод не применяется к корзине. Баг заведён, ждём фикса в 2.10.0',
      author: 'Анна',
    },
  },
  {
    category: 'product',
    message: 'Кнопка «Оплатить» остаётся неактивной после выбора способа оплаты',
    excClass: 'java.lang.AssertionError',
    comment: {
      body: 'Дефект PRODUCT-1130 (критичный): блокировка кнопки оплаты. Передано команде Checkout',
      author: 'Анна',
    },
  },
  {
    category: 'flaky',
    message: 'Задержка ответа > 15s на шаге оформления, повторный запуск проходит',
    excClass: 'org.openqa.selenium.TimeoutException',
    comment: {
      body: 'Нестабильный тест: зависит от нагрузки стенда. Кандидат в карантин после анализа flaky',
      author: 'Игорь',
    },
  },
  {
    category: 'auto',
    message: 'StaleElementReferenceException: элемент toast-notification исчез до чтения текста',
    excClass: 'org.openqa.selenium.StaleElementReferenceException',
    comment: {
      body: 'Нестабильный локатор toast: переписываем на ожидание стабильности элемента, PR #452 в ревью',
      author: 'Мария',
    },
  },
  {
    category: 'auto',
    message: 'Локатор #checkout-total не найден после редизайна страницы оплаты',
    excClass: 'org.openqa.selenium.NoSuchElementException',
    comment: {
      body: 'Редизайн оплаты сломал локаторы: обновляем page object, задача AUTO-201',
      author: 'Мария',
    },
  },
  {
    category: 'product',
    message: 'Письмо-подтверждение не приходит в течение 5 минут после оформления заказа',
    excClass: 'java.lang.AssertionError',
    // без комментария — для демонстрации группы «Без комментария»
  },
  {
    category: 'product',
    message: 'История заказов не отображает заказы за прошлый месяц (пустой список)',
    excClass: 'java.lang.AssertionError',
    comment: {
      body: 'Похоже на проблему индексации в orders-search, разбираемся с командой данных',
      author: 'Дмитрий',
    },
  },
  {
    category: 'auto',
    message: 'Тестовый пользователь qa-std-042 заблокирован — данные устарели',
    excClass: 'java.lang.IllegalStateException',
    comment: {
      body: 'Тестовые данные протухли: обновили датасет qa-std-042, перезапуск должен пройти',
      author: 'Мария',
    },
  },
  {
    category: 'other',
    message: 'java.lang.OutOfMemoryError в песочнице браузера (chromium 131)',
    excClass: 'java.lang.OutOfMemoryError',
    // без комментария
  },
];

function stackTraceFor(def: Def, t: Template): string {
  const file = def.className.split('.').pop();
  return [
    `${t.excClass}: ${t.message}`,
    `\tat org.testng.Assert.fail(Assert.java:${rint(90, 110)})`,
    `\tat ${def.className}.${def.methodName}(${file}.java:${rint(40, 420)})`,
    `\tat java.base/jdk.internal.reflect.DirectMethodHandleAccessor.invoke(DirectMethodHandleAccessor.java:103)`,
    `\tat org.testng.internal.invokers.TestInvoker.invokeTestMethods(TestInvoker.java:${rint(200, 240)})`,
  ].join('\n');
}

/* ------------------------------ статусы прогона ------------------------------ */

interface PlannedResult {
  def: Def;
  defId: number;
  status: 'passed' | 'failed' | 'broken' | 'skipped';
  errorMessage: string | null;
  stackTrace: string | null;
  durationMs: number | null;
}

function statusFor(def: Def): Pick<PlannedResult, 'status' | 'errorMessage'> {
  const b = def.behaviour;
  switch (b.kind) {
    case 'pass':
      return { status: 'passed', errorMessage: null };
    case 'skip':
      return { status: 'skipped', errorMessage: null };
    case 'fail':
    case 'broken':
    case 'flaky': {
      const t = TEMPLATES[b.template];
      if (b.kind === 'flaky') {
        return rnd() < 0.55
          ? { status: 'passed', errorMessage: null }
          : { status: 'failed', errorMessage: t.message };
      }
      return {
        status: b.kind === 'fail' ? 'failed' : 'broken',
        errorMessage: t.message,
      };
    }
    default:
      return { status: 'passed', errorMessage: null };
  }
}

function durationFor(status: PlannedResult['status']): number {
  if (status === 'skipped') return rint(0, 50);
  if (status === 'passed') return rint(400, 9000);
  return rint(1800, 28000);
}

/** Результаты полного прогона. */
function planFullRun(defs: Def[], ids: Map<string, number>): PlannedResult[] {
  return defs.map((def) => {
    const s = statusFor(def, 0);
    const t = s.errorMessage ? TEMPLATES[templateOf(def)] : null;
    return {
      def,
      defId: ids.get(defKey(def)) as number,
      ...s,
      stackTrace: t && s.status !== 'passed' ? stackTraceFor(def, t) : null,
      durationMs: durationFor(s.status),
    };
  });
}

/** Реран: только упавшие, часть чинится. */
function planRerun(prev: PlannedResult[], ids: Map<string, number>, fixRate: number): PlannedResult[] {
  const out: PlannedResult[] = [];
  for (const r of prev) {
    if (r.status !== 'failed' && r.status !== 'broken') continue;
    const def = r.def;
    const fixed = rnd() < fixRate;
    const s = fixed ? { status: 'passed' as const, errorMessage: null } : { status: r.status, errorMessage: r.errorMessage };
    const t = s.errorMessage ? TEMPLATES[templateOf(def)] : null;
    out.push({
      def,
      defId: ids.get(defKey(def)) as number,
      ...s,
      stackTrace: t && s.status !== 'passed' ? stackTraceFor(def, t) : null,
      durationMs: durationFor(s.status),
    });
  }
  return out;
}

function templateOf(def: Def): number {
  const b = def.behaviour;
  return b.kind === 'pass' || b.kind === 'skip' ? -1 : b.template;
}

function defKey(d: Def): string {
  return `${d.className}|${d.methodName}|${d.paramsHash}`;
}

/* ------------------------------ запись в БД ------------------------------ */

const sql = postgres(DATABASE_URL, {
  max: 1,
  // bigserial (int8) по умолчанию возвращается строкой — парсим в number,
  // иначе Set.has(id) в runProgress не находит существующие тесты
  types: {
    bigint: {
      to: 20,
      from: [20],
      parse: (x: string) => Number(x),
      serialize: (x: number) => String(x),
    },
  },
});

async function insertDefs(defs: Def[]): Promise<Map<string, number>> {
  const chunk = 500;
  for (let i = 0; i < defs.length; i += chunk) {
    const p = defs.slice(i, i + chunk);
    const rows = p.map((d) => ({
      class_name: d.className,
      method_name: d.methodName,
      params_hash: d.paramsHash,
      params_json: sql`${d.paramsJson}::jsonb`,
    }));
    await sql`insert into testreport.test_defs ${sql(rows, 'class_name', 'method_name', 'params_hash', 'params_json')}
      on conflict do nothing`;
  }
  const rows = await sql`select id, class_name, method_name, params_hash from testreport.test_defs`;
  const map = new Map<string, number>();
  for (const r of rows) map.set(`${r.class_name}|${r.method_name}|${r.params_hash}`, r.id);
  return map;
}

interface RunPlan {
  build: string;
  source: 'ci' | 'local';
  branch: string;
  triggeredBy: string;
  ciUrl: string | null;
  startedAt: Date;
  durationMin: number;
  finished: boolean;
  results: PlannedResult[];
}

async function insertRun(plan: RunPlan): Promise<number> {
  const finishedAt = plan.finished ? new Date(plan.startedAt.getTime() + (plan.durationMin + 2) * 60_000) : null;
  const [row] = await sql`
    insert into testreport.runs (ci_run_id, build_version, source, branch, ci_url, triggered_by, started_at, finished_at)
    values (${crypto.randomUUID()}, ${plan.build}, ${plan.source}, ${plan.branch}, ${plan.ciUrl}, ${plan.triggeredBy},
            ${plan.startedAt.toISOString()}, ${finishedAt ? finishedAt.toISOString() : null})
    returning id`;
  return row.id as number;
}

async function insertResults(runId: number, results: PlannedResult[], startedAt: Date, durationMin: number): Promise<void> {
  const chunk = 500;
  for (let i = 0; i < results.length; i += chunk) {
    const p = results.slice(i, i + chunk);
    const rows = p.map((r, j) => {
      const globalIdx = i + j;
      const progress = results.length === 1 ? 1 : globalIdx / results.length;
      const at = new Date(startedAt.getTime() + progress * durationMin * 60_000 + rint(0, 30_000));
      return {
        run_id: runId,
        test_def_id: r.defId,
        status: r.status,
        attempt_no: 1,
        duration_ms: r.durationMs,
        error_message: r.errorMessage,
        stack_trace: r.stackTrace,
        tags: r.def.tags,
        started_at: sql`${at.toISOString()}::timestamptz`,
      };
    });
    await sql`insert into testreport.results ${sql(rows, 'run_id', 'test_def_id', 'status', 'attempt_no', 'duration_ms', 'error_message', 'stack_trace', 'tags', 'started_at')}
      on conflict do nothing`;
  }
}

async function insertComment(defId: number, build: string, t: Template): Promise<void> {
  if (!t.comment) return;
  await sql`
    insert into testreport.failure_comments (test_def_id, build_version, category, body, author)
    values (${defId}, ${build}, ${t.category}, ${t.comment.body}, ${t.comment.author})
    on conflict (test_def_id, build_version) do nothing`;
}

/* ------------------------------ сценарий ------------------------------ */

async function reset(): Promise<void> {
  await sql`truncate table testreport.failure_comments, testreport.results, testreport.runs, testreport.test_defs restart identity`;
}

async function main(): Promise<void> {
  if (PROGRESS) {
    await runProgress();
    return;
  }

  console.log('Очистка старых данных…');
  await reset();

  console.log('Генерация каталога тестов (~4000)…');
  const defs = buildCatalog(4000);
  console.log(`  создано определений тестов: ${defs.length}`);

  console.log('Запись test_defs…');
  const ids = await insertDefs(defs);

  const now = Date.now();
  const MIN = 60_000;

  /* билд 2.7.0 — неделю назад: полный прогон + CI-реран */
  console.log('Билд 2.7.0: полный прогон…');
  const b27full = planFullRun(defs, ids);
  const b27start = new Date(now - 7 * 24 * 60 * MIN);
  let runId = await insertRun({
    build: '2.7.0', source: 'ci', branch: 'release/2.7', triggeredBy: 'ci-scheduler',
    ciUrl: 'https://ci.local/job/autotests/2711', startedAt: b27start, durationMin: 118, finished: true, results: b27full,
  });
  await insertResults(runId, b27full, b27start, 118);
  console.log(`  прогон #${runId}: ${b27full.length} результатов`);

  console.log('Билд 2.7.0: реран упавших…');
  const b27rerun = planRerun(b27full, ids, 0.55);
  const b27rStart = new Date(b27start.getTime() + 125 * MIN);
  runId = await insertRun({
    build: '2.7.0', source: 'ci', branch: 'release/2.7', triggeredBy: 'ci-rerun',
    ciUrl: 'https://ci.local/job/autotests/2712', startedAt: b27rStart, durationMin: 24, finished: true, results: b27rerun,
  });
  await insertResults(runId, b27rerun, b27rStart, 24);
  console.log(`  реран #${runId}: ${b27rerun.length} результатов, починено ~55%`);

  /* билд 2.8.0 — 2 дня назад: полный прогон + локальный реран */
  console.log('Билд 2.8.0: полный прогон…');
  const b28full = planFullRun(defs, ids);
  const b28start = new Date(now - 2 * 24 * 60 * MIN);
  runId = await insertRun({
    build: '2.8.0', source: 'ci', branch: 'release/2.8', triggeredBy: 'ci-scheduler',
    ciUrl: 'https://ci.local/job/autotests/2845', startedAt: b28start, durationMin: 121, finished: true, results: b28full,
  });
  await insertResults(runId, b28full, b28start, 121);
  console.log(`  прогон #${runId}: ${b28full.length} результатов`);

  console.log('Билд 2.8.0: локальный реран упавших (Дмитрий)…');
  const b28rerun = planRerun(b28full, ids, 0.6);
  const b28rStart = new Date(b28start.getTime() + 150 * MIN);
  runId = await insertRun({
    build: '2.8.0', source: 'local', branch: 'bugfix/checkout-locators', triggeredBy: 'Дмитрий (локально)',
    ciUrl: null, startedAt: b28rStart, durationMin: 21, finished: true, results: b28rerun,
  });
  await insertResults(runId, b28rerun, b28rStart, 21);
  console.log(`  реран #${runId}: ${b28rerun.length} результатов, починено ~60%`);

  /* билд 2.9.0 — сейчас: оборванный прогон (~62%) */
  console.log('Билд 2.9.0: оборванный прогон (62% каталога, finished_at = null)…');
  const subset = defs.filter((_, i) => i % 100 < 62);
  const b29full = planFullRun(subset, ids);
  const b29start = new Date(now - 42 * MIN);
  runId = await insertRun({
    build: '2.9.0', source: 'ci', branch: 'feature/checkout-v2', triggeredBy: 'ci-scheduler',
    ciUrl: 'https://ci.local/job/autotests/2913', startedAt: b29start, durationMin: 42, finished: false, results: b29full,
  });
  await insertResults(runId, b29full, b29start, 42);
  console.log(`  прогон #${runId}: ${b29full.length} результатов из ${defs.length} (${Math.round((subset.length / defs.length) * 100)}%)`);

  /* комментарии: финально упавшие билдов 2.7.0/2.8.0 + пара свежих в 2.9.0 */
  console.log('Комментарии к падениям…');
  await seedComments(b27full, b27rerun, ids, '2.7.0');
  await seedComments(b28full, b28rerun, ids, '2.8.0');

  let fresh = 0;
  for (const r of b29full) {
    if ((r.status === 'failed' || r.status === 'broken') && fresh < 4) {
      const t = TEMPLATES[templateOf(r.def)];
      if (t?.comment) {
        await insertComment(r.defId, '2.9.0', t);
        fresh++;
      }
    }
  }
  console.log(`  2.9.0: ${fresh} свежих комментариев`);

  console.log('\nГотово. Сценарий для демонстрации:');
  console.log('  1. Откройте http://localhost:3000 — по умолчанию билд 2.9.0 (идёт сейчас).');
  console.log('  2. «Прогоны билда» -> «Отсутствуют…» на оборванном прогоне: ~38% тестов нет — список можно скопировать и перезапустить.');
  console.log('  3. Переключитесь на 2.8.0: счётчик «Починен» (после локального рерана), группы причин падений по комментариям.');
  console.log('  4. В другом терминале: npm run demo:progress — затем «Обновить» в UI: появятся новые результаты (дельта-загрузка).');
  console.log('  5. Снимите билд и выберите его снова — загрузится только дельта от кеша.');
}

async function seedComments(full: PlannedResult[], rerun: PlannedResult[], ids: Map<string, number>, build: string): Promise<void> {
  const rerunByDef = new Map(rerun.map((r) => [r.defId, r.status]));
  let n = 0;
  for (const r of full) {
    if (r.status !== 'failed' && r.status !== 'broken') continue;
    const finalStatus = rerunByDef.get(r.defId) ?? r.status;
    if (finalStatus === 'passed') continue; // починен — комментарий не нужен
    const t = TEMPLATES[templateOf(r.def)];
    if (!t?.comment) continue;
    await insertComment(r.defId, build, t);
    n++;
  }
  console.log(`  ${build}: ${n} комментариев`);
}

/** Дописать следующую порцию в незавершённый прогон (имитация живого 2-часового прогона). */
async function runProgress(): Promise<void> {
  const [running] = await sql`
    select id, build_version, started_at from testreport.runs
    where finished_at is null order by id desc limit 1`;
  if (!running) {
    console.log('Незавершённых прогонов нет — сначала выполните: npm run demo');
    return;
  }
  const runId = running.id as number;
  const existing = new Set(
    (await sql`select test_def_id from testreport.results where run_id = ${runId}`).map((r) => r.test_def_id as number),
  );
  const allDefs = await sql`select id, class_name, method_name, params_hash, params_json from testreport.test_defs order by id`;
  const defRows = allDefs.filter((d) => !existing.has(d.id));
  if (defRows.length === 0) {
    console.log(`Прогон #${runId} уже покрыл весь каталог — досчитывать нечего.`);
    return;
  }
  const portion = defRows.slice(0, Math.min(400, defRows.length));
  const now = Date.now();
  const rows = portion.map((d, j) => {
    const roll = rnd();
    const status = roll < 0.94 ? 'passed' : roll < 0.975 ? 'failed' : roll < 0.985 ? 'broken' : 'skipped';
    const t = status === 'failed' || status === 'broken' ? pick(TEMPLATES) : null;
    return {
      defId: d.id as number,
      status,
      errorMessage: t ? t.message : null,
      stackTrace: null,
      durationMs: rint(400, 12000),
      tags: ['epic:Progress'],
      startedAt: new Date(now - rint(0, 120_000)).toISOString(),
    };
  });
  const insertRows = rows.map((r) => ({
    run_id: runId,
    test_def_id: r.defId,
    status: r.status,
    attempt_no: 1,
    duration_ms: r.durationMs,
    error_message: r.errorMessage,
    stack_trace: r.stackTrace,
    tags: r.tags,
    started_at: sql`${r.startedAt}::timestamptz`,
  }));
  await sql`insert into testreport.results ${sql(insertRows, 'run_id', 'test_def_id', 'status', 'attempt_no', 'duration_ms', 'error_message', 'stack_trace', 'tags', 'started_at')}
    on conflict do nothing`;
  console.log(`Прогон #${runId} (${running.build_version}): +${rows.length} результатов. Нажмите «Обновить» в UI — придёт только дельта.`);
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error('Ошибка:', e instanceof Error ? e.message : e);
    if (String(e).includes('does not exist')) {
      console.error('\nПохоже, схема testreport не создана. Сначала выполните: npm run db:push');
    }
    await sql.end();
    process.exit(1);
  });
