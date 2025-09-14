# Firebase Config Migration Note

## Issue
Firebase `functions.config()` API is deprecated and will be shut down in **March 2026**.

## Current Status
- All Firebase functions currently use `functions.config()` to access configuration
- Functions will continue working until March 2026
- After March 2026, `firebase deploy` will fail for functions using the legacy API

## Migration Required
Need to migrate from `functions.config()` to environment variables using `.env` files.

### Current Config Values
```bash
# Get current config
firebase functions:config:get
```

### Migration Steps
1. Create `.env` file in `functions/` directory
2. Move all config values to environment variables
3. Update all functions to use `process.env.VARIABLE_NAME`
4. Deploy updated functions

### Alternative Consideration
May migrate to Netlify Functions instead of Firebase Functions, which would eliminate this migration need.

## Timeline
- **Deadline**: March 2026
- **Priority**: Low (can be done gradually)
- **Impact**: Functions will stop deploying if not migrated

## References
- [Firebase Migration Guide](https://firebase.google.com/docs/functions/config-env#migrate-to-dotenv)
- Current config: `firebase functions:config:get`
