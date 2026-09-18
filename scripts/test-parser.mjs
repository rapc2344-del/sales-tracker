import { parsePurchaseText } from "../src/lib/parser.ts";
import assert from "node:assert";

console.log("Running parser tests...\n");

// Test 1: Message purchase with markdown link & non-parenthesized name
const messageSample = `Mo
@zainmarforq
$$ - Medium Spenders-LKB
has purchased your [message](https://onlyfans.com/my/chats/chat/555929415?firstId=11267347455401) for $20.00!
Sep. 18, 2026 at 4:15 AM`;

const result1 = parsePurchaseText(messageSample);
console.log("Result 1 (Message):", result1);
assert(result1 !== null, "Result 1 should not be null");
assert.strictEqual(result1.name, "Mo");
assert.strictEqual(result1.username, "@zainmarforq");
assert.strictEqual(result1.sale_type, "message");
assert.strictEqual(result1.amount, 20.0);
assert.strictEqual(result1.date, "2026-09-18");

// Test 2: Tip purchase
const tipSample = `JoeJoe SouthBX
@joejoe_southbx
Add to favorites and other lists
paid you a tip of $1.00
Sep. 13, 2026 at 7:09 PM`;

const result2 = parsePurchaseText(tipSample);
console.log("Result 2 (Tip):", result2);
assert(result2 !== null, "Result 2 should not be null");
assert.strictEqual(result2.name, "JoeJoe SouthBX");
assert.strictEqual(result2.username, "@joejoe_southbx");
assert.strictEqual(result2.sale_type, "tip");
assert.strictEqual(result2.amount, 1.0);
assert.strictEqual(result2.date, "2026-09-13");

// Test 3: Legacy sample format
const legacySample = `🐳(Kody)
@u80636081
XXXtreme Spenders-V8Ctalking rn 10/14/25
has purchased your message for $30.99!`;

const result3 = parsePurchaseText(legacySample);
console.log("Result 3 (Legacy):", result3);
assert(result3 !== null, "Result 3 should not be null");
assert.strictEqual(result3.name, "Kody");
assert.strictEqual(result3.username, "@u80636081");
assert.strictEqual(result3.sale_type, "message");
assert.strictEqual(result3.amount, 30.99);
assert.strictEqual(result3.date, "2025-10-14");

// Test 4: Invalid text
const result4 = parsePurchaseText("Random nonsense text");
assert.strictEqual(result4, null, "Result 4 should be null");

console.log("\nAll parser tests passed successfully! ✅");
