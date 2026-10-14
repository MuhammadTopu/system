import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// The two Google Play base plans of maintenance_genie_premium. Safe to run
// repeatedly: rows are matched on rc_product_id and never duplicated.
const PLANS = [
  {
    rc_product_id: "maintenance_genie_premium:mg-monthly",
    name: "Premium — monthly",
    description: "Monthly plan, billed through Google Play",
    price: 5.0,
    features: ["Unlimited items", "Email reminders", "OCR receipts"],
    plan: "Monthly",
  },
  {
    rc_product_id: "maintenance_genie_premium:mg-annual",
    name: "Premium — yearly",
    description: "Annual plan with best value",
    price: 50.0,
    features: ["Unlimited items", "Priority support", "OCR receipts"],
    plan: "Yearly",
  },
];

async function main() {
  for (const { rc_product_id, ...data } of PLANS) {
    const service = await prisma.services.upsert({
      where: { rc_product_id },
      // keep a price an admin changed through the price-update API
      update: { name: data.name, description: data.description, features: data.features },
      create: { rc_product_id, ...data },
    });
    console.info(`${service.rc_product_id}: ${service.name} ($${service.price})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
