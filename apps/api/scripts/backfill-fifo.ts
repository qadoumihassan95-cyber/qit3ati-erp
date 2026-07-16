/**
 * One-time FIFO backfill.
 *
 * For every existing PurchaseItem that doesn't have a FifoLayer yet,
 * create one with:
 *   qtyReceived  = purchaseItem.qty
 *   qtyRemaining = purchaseItem.qty
 *
 * This is a pragmatic conservative estimate — it assumes existing stock
 * on hand corresponds 1:1 to the original purchase quantities. Any
 * historical sales that pre-date FIFO are NOT re-processed; their
 * cost snapshots (sales_items.unit_cost) remain the authority for
 * historical reports.
 *
 * Safe to re-run: creates layers only where none exist yet.
 *
 * Usage:
 *   cd apps/api && node dist/scripts/backfill-fifo.js
 * or with tsx:
 *   npx tsx apps/api/scripts/backfill-fifo.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('▶ Scanning purchase items without a FIFO layer...');

  // Find all purchase items that don't have a corresponding layer.
  // We fetch invoice + branch inline to build the layer.
  const items = await prisma.$queryRawUnsafe<any[]>(`
    SELECT pi.id, pi.part_id, pi.qty, pi.unit_cost,
           inv.tenant_id, inv.branch_id, inv.invoice_date, inv.created_at
      FROM purchase_items pi
      JOIN purchase_invoices inv ON inv.id = pi.invoice_id
      LEFT JOIN fifo_layers fl ON fl.purchase_item_id = pi.id
     WHERE inv.deleted_at IS NULL
       AND pi.part_id IS NOT NULL
       AND pi.qty IS NOT NULL
       AND pi.qty > 0
       AND fl.id IS NULL
  `);

  console.log(`  found ${items.length} purchase items needing layers`);

  let created = 0;
  let skipped = 0;
  for (const it of items) {
    try {
      await prisma.fifoLayer.create({
        data: {
          tenantId: it.tenant_id,
          branchId: it.branch_id,
          partId:   it.part_id,
          purchaseItemId: it.id,
          origin:   'backfill',
          qtyReceived: it.qty,
          qtyRemaining: it.qty,
          unitCost: it.unit_cost ?? 0,
          receivedAt: it.invoice_date ?? it.created_at,
        },
      });
      created++;
    } catch (e: any) {
      // If a race with the live purchase flow created it first, skip.
      skipped++;
      if (skipped <= 5) console.warn(`  skipped ${it.id}: ${e?.message ?? e}`);
    }
  }

  console.log(`✓ Backfill complete. Created ${created} layers, skipped ${skipped}.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
