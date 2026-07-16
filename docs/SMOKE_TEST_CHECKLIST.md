# Daarayn Platform — Post-Deployment Smoke Test

Run this checklist within **5 minutes of every production deployment** before marking the deploy "done".
If any item fails, **immediately roll back** and open a Critical incident.

---

## Checklist

### 1. Public Website
- [ ] Visit `https://daarayn.org` — page loads without errors
- [ ] Donation button visible and navigates to `/pay`
- [ ] Footer logo and branding correct ("DAARAYN / FOUNDATION")

### 2. Admin Panel
- [ ] Visit `/admin/login` — login form renders
- [ ] Log in as admin — dashboard loads with data
- [ ] Notification Center (`/admin/notifications`) — loads and shows real-time updates
- [ ] Sidebar navigation — all links reachable without 404

### 3. MOMIN AI
- [ ] Visit `/admin/ai` — workspace loads
- [ ] Send a simple query (e.g. "How many donors do we have?")
- [ ] Response returns within 30 seconds
- [ ] No "500 Internal Server Error" in browser console

### 4. Donation Flow
- [ ] Visit `/pay` — payment page renders correctly
- [ ] Amount field accepts input
- [ ] Form submits without JS error (test mode / no real payment required)

### 5. Field Agent Portal
- [ ] Visit `/field` — portal loads
- [ ] Login as a field agent — dashboard renders
- [ ] New report form (`/field/new`) — opens and accepts input

---

## On Failure

| Failure | Action |
|---|---|
| Any Critical page returns 500 | Roll back immediately via deployment platform |
| MOMIN AI crashes | Check Groq API key validity and provider health |
| Donation form JS error | Check `/api/donate` route logs |
| Admin login broken | Check Firebase Auth configuration |

---

## Roll Back Procedure

**Vercel:**
```bash
vercel rollback [deployment-url]
```

**Manual:**
1. Go to Vercel/Railway deployment dashboard
2. Find previous successful deployment
3. Click "Promote to Production"
4. Re-run this smoke test on the rolled-back version

---

*This checklist is part of Section B.11 and Section D of PRODUCTION_AUDIT_SOP.md*
