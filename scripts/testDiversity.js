async function test() {
  const reqs = Array(3).fill(0).map(() => fetch('http://localhost:3000/api/admin/ai/copilot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Why did funds drop last week?', userId: 'U1', userRole: 'admin', history: [] })
  }).then(r => r.json()));
  
  const results = await Promise.all(reqs);
  results.forEach((r, i) => {
      console.log(`\n[Response ${i+1}]:\n${r.reply?.substring(0, 300).replace(/\n/g, ' ')}...`);
  });
}
test().catch(console.error);
