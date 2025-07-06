# Task Completion Checklist

When completing development tasks, ensure:

## Code Quality
- [ ] Run `npm run lint` to check code style
- [ ] Run `npm run lint:fix` to auto-fix style issues
- [ ] All ESLint warnings/errors resolved

## Testing
- [ ] Run `npm test` to ensure all tests pass
- [ ] Add/update tests for new functionality
- [ ] Test with `node test_startround.js` for game logic changes

## Development Verification
- [ ] Test with `npm run dev` for hot reload functionality
- [ ] Verify multiplayer functionality works correctly
- [ ] Check that socket events are properly handled

## Asset Management
- [ ] Regenerate assets with `python3 scripts/generate_assets.py` if needed
- [ ] Verify asset preview in `client/asset_preview.html`

## Documentation
- [ ] Update relevant documentation if architecture changes
- [ ] Add comments for complex game logic