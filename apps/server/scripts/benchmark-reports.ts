/**
 * CWB-57 report benchmark: seeds a disposable dataset into the *_test database, then compares
 * loading every booking (previous approach) with DB aggregation (groupBy) and times the real
 * repository calls. Usage: npx tsx scripts/benchmark-reports.ts [bookingCount] [iterations]
 * Never point TEST_DATABASE_URL at shared data; seeded rows are removed at the end.
 */
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { BookingStatus, PaymentStatus, Prisma, PrismaClient, RoomStatus } from '@prisma/client';
import { validateTestDatabase } from '../src/__tests__/support/test-database.js';

dotenv.config();
// The app client logs every query in development; keep the benchmark output readable.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = validateTestDatabase(
  process.env.TEST_DATABASE_URL,
  process.env.DATABASE_URL,
);

const BOOKINGS = Number(process.argv[2] ?? 20000);
const ITERATIONS = Number(process.argv[3] ?? 30);
const ROOMS = 20;
const runId = randomUUID().slice(0, 8);
const prefix = `BENCH_${runId}`;

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};
const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

async function measure(label: string, run: () => Promise<number>) {
  for (let i = 0; i < 3; i++) await run();
  const times: number[] = [];
  let rows = 0;
  const heapBefore = process.memoryUsage().heapUsed;
  let heapPeak = heapBefore;
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    rows = await run();
    times.push(performance.now() - start);
    heapPeak = Math.max(heapPeak, process.memoryUsage().heapUsed);
  }
  console.log(
    `| ${label} | ${rows} | ${percentile(times, 50).toFixed(1)} | ${percentile(times, 95).toFixed(1)} | ${mb(heapPeak - heapBefore)} |`,
  );
}

async function main() {
  const queries: string[] = [];
  const db = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
  db.$on('query', (e) => queries.push(e.query));
  const { summarizeBookingRevenue, summarizeRevenueGroups, toRevenueGroups } =
    await import('../src/utils/booking-revenue.util.js');
  const { BookingRepository } = await import('../src/repositories/booking.repository.js');
  const { AdminDashboardRepository } =
    await import('../src/repositories/admin-dashboard.repository.js');
  const { prisma: appPrisma } = await import('../src/utils/prisma.util.js');

  try {
    const rooms = await Promise.all(
      Array.from({ length: ROOMS }, (_, i) =>
        db.room.create({
          data: {
            name: `${prefix}_room_${i}`,
            capacity: 4,
            pricePerHour: new Prisma.Decimal('150000.00'),
            status: RoomStatus.AVAILABLE,
            createdAt: new Date('2025-01-01T00:00:00Z'),
            statusHistory: {
              create: {
                status: RoomStatus.AVAILABLE,
                effectiveAt: new Date('2025-01-01T00:00:00Z'),
              },
            },
          },
        }),
      ),
    );
    // Spread over the past year; past CONFIRMED rows disable attendance tracking so the lazy
    // no-show evaluator does not rewrite the dataset while timing.
    const statuses = [
      BookingStatus.COMPLETED,
      BookingStatus.COMPLETED,
      BookingStatus.CANCELLED,
      BookingStatus.NO_SHOW,
      BookingStatus.CONFIRMED,
    ];
    const base = Date.UTC(2025, 10, 1, 2);
    const rows = Array.from({ length: BOOKINGS }, (_, i) => {
      const status = statuses[i % statuses.length];
      const start = new Date(base + (i % 365) * 86_400_000 + (i % 12) * 3_600_000);
      return {
        bookingCode: `${prefix}_${i}`,
        roomId: rooms[i % ROOMS].id,
        startTime: start,
        endTime: new Date(start.getTime() + 2 * 3_600_000),
        totalAmount: new Prisma.Decimal('300000.00'),
        status,
        paymentStatus: i % 3 === 0 ? PaymentStatus.UNPAID : PaymentStatus.PAID,
        attendanceTrackingEnabled: status !== BookingStatus.CONFIRMED,
        guestName: 'Benchmark guest',
        guestPhone: '0900000000',
      };
    });
    for (let i = 0; i < rows.length; i += 2000) {
      await db.booking.createMany({ data: rows.slice(i, i + 2000) });
    }
    const total = await db.booking.count();
    console.log(
      `Dataset: ${BOOKINGS} seeded bookings (${total} total in table), ${ITERATIONS} iterations\n`,
    );

    console.log('| Query | Rows returned to Node | p50 ms | p95 ms | Heap growth MB |');
    console.log('| --- | --- | --- | --- | --- |');
    await measure('Revenue, previous: findMany all + summarize in Node', async () => {
      const records = await db.booking.findMany({
        select: { status: true, paymentStatus: true, totalAmount: true },
      });
      summarizeBookingRevenue(records);
      return records.length;
    });
    await measure('Revenue, new: groupBy(status, paymentStatus)', async () => {
      const groupRows = await db.booking.groupBy({
        by: ['status', 'paymentStatus'],
        _count: { _all: true },
        _sum: { totalAmount: true },
      });
      summarizeRevenueGroups(toRevenueGroups(groupRows));
      return groupRows.length;
    });
    const repo = new BookingRepository();
    await measure('Repository calculateRevenue({}) incl. lazy no-show check', async () => {
      await repo.calculateRevenue({});
      return 0;
    });
    const dashboard = new AdminDashboardRepository();
    const weekStart = new Date(base + 120 * 86_400_000);
    await measure('Repository getKpiData (7-day period)', async () => {
      await dashboard.getKpiData({
        startDate: weekStart,
        endDate: new Date(weekStart.getTime() + 7 * 86_400_000),
        todayStart: weekStart,
        todayEnd: new Date(weekStart.getTime() + 86_400_000),
      });
      return 0;
    });

    queries.length = 0;
    await db.booking.findMany({ select: { status: true, paymentStatus: true, totalAmount: true } });
    const previousQueries = queries.length;
    queries.length = 0;
    await db.booking.groupBy({
      by: ['status', 'paymentStatus'],
      _count: { _all: true },
      _sum: { totalAmount: true },
    });
    console.log(
      `\nSQL queries per call: previous=${previousQueries} (returns ${total} rows), groupBy=${queries.length} (returns at most 8 rows)`,
    );

    for (const [label, sql] of [
      ['previous', 'SELECT status, payment_status, total_amount FROM bookings'],
      [
        'groupBy',
        'SELECT status, payment_status, COUNT(*), SUM(total_amount) FROM bookings GROUP BY status, payment_status',
      ],
    ] as const) {
      // Static SQL with no user input; EXPLAIN only reads the plan.
      const plan = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `EXPLAIN FORMAT=TREE ${sql}`,
      );
      const text = plan.map((row) => Object.values(row).map(String).join(' ')).join('\n');
      console.log(`\nEXPLAIN (${label}):\n${text}`);
    }
  } finally {
    await db.booking.deleteMany({ where: { bookingCode: { startsWith: prefix } } });
    await db.room.deleteMany({ where: { name: { startsWith: prefix } } });
    await db.$disconnect();
    await appPrisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
