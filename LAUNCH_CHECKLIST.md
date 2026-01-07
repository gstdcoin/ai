# GSTD Platform - Mainnet Launch Checklist

## Pre-Launch Verification

### ✅ Database Cleanup
- [ ] Run `./scripts/production_ready.sh`
- [ ] Verify all tables are empty
- [ ] Confirm sequences reset to 1

### ✅ Environment Configuration
- [ ] `GIN_MODE=release` set
- [ ] `ADMIN_SECRET` set to strong random string
- [ ] `TON_NETWORK=mainnet` confirmed
- [ ] All mainnet addresses verified:
  - [ ] XAUt: `EQCyD8v6khUUrce9BCvHOaBC9PrvlV9S7D5v67O80p444XAr`
  - [ ] Treasury: `EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp`
  - [ ] STON.fi Router: Mainnet address

### ✅ Frontend Build
- [ ] `NEXT_PUBLIC_API_URL=https://app.gstdtoken.com/api`
- [ ] Production build completed
- [ ] No localhost references

### ✅ Infrastructure
- [ ] All containers rebuilt
- [ ] SSL certificate valid
- [ ] Nginx configured
- [ ] Log rotation active

### ✅ Security
- [ ] Admin endpoints protected
- [ ] Error sanitization active
- [ ] Withdrawal locks functional

## Launch Sequence

1. **Database Reset** → Clean slate
2. **Environment Lock** → Production mode
3. **Build & Deploy** → Latest code
4. **Infrastructure Start** → All services up
5. **Smoke Test** → First transaction

## Post-Launch

- [ ] First wallet connected
- [ ] First node registered
- [ ] First task created
- [ ] First task completed
- [ ] First XAUt swap recorded
- [ ] Golden Reserve updated

---

**Launch Date**: _______________
**Launch Time**: _______________
**Launch Coordinator**: _______________

