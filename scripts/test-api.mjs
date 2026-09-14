// scripts/test-api.mjs
async function run() {
  console.log("--- 1. Testing GET /api/models ---");
  let res = await fetch("http://localhost:3000/api/models");
  let data = await res.json();
  console.log("Models:", data);

  console.log("\n--- 2. Testing POST /api/models ---");
  res = await fetch("http://localhost:3000/api/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Elena" }),
  });
  data = await res.json();
  console.log("Created Model:", data);

  console.log("\n--- 3. Testing POST /api/parse (valid sample) ---");
  const sample = `🐳(Kody)\n@u80636081\nXXXtreme Spenders-V8Ctalking rn 10/14/25\nhas purchased your message for $30.99!`;
  res = await fetch("http://localhost:3000/api/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: sample }),
  });
  const parseResult = await res.json();
  console.log("Parsed:", parseResult);

  console.log("\n--- 4. Testing POST /api/parse (invalid format) ---");
  res = await fetch("http://localhost:3000/api/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Random unstructured nonsense without required fields" }),
  });
  const invalidResult = await res.json();
  console.log("Invalid format returns null?:", invalidResult.parsed === null);

  console.log("\n--- 5. Testing POST /api/sales ---");
  res = await fetch("http://localhost:3000/api/sales", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: parseResult.parsed.name,
      username: parseResult.parsed.username,
      amount: parseResult.parsed.amount,
      sale_type: parseResult.parsed.sale_type,
      model: "Elena",
      tier: "vip",
      date: parseResult.parsed.date,
      raw_text: sample,
    }),
  });
  const newSale = await res.json();
  console.log("Created Sale:", newSale);

  console.log("\n--- 6. Testing GET /api/sales ---");
  res = await fetch("http://localhost:3000/api/sales");
  const sales = await res.json();
  console.log(`Fetched ${sales.length} sales. Top sale:`, sales[0]);

  console.log("\n--- 7. Testing PUT /api/sales/:id ---");
  res = await fetch(`http://localhost:3000/api/sales/${newSale.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: 45.00, tier: "free" }),
  });
  const updatedSale = await res.json();
  console.log("Updated Sale:", updatedSale);

  console.log("\n--- 8. Testing POST /api/summarize ---");
  res = await fetch("http://localhost:3000/api/summarize", {
    method: "POST",
  });
  const summary = await res.json();
  console.log("Summary:", JSON.stringify(summary, null, 2));

  console.log("\n--- 9. Testing DELETE /api/sales/:id ---");
  res = await fetch(`http://localhost:3000/api/sales/${newSale.id}`, {
    method: "DELETE",
  });
  const deleteResult = await res.json();
  console.log("Delete result:", deleteResult);

  console.log("\nAll API tests completed successfully!");
}

run().catch(console.error);
