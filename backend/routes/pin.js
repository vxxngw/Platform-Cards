// Metadata pinning for the Pack Builder (admin only). See lib/pin.js.
const E = require('../lib/engine')
const { createPinRouter, makeIsAdmin } = require('../lib/pin')

module.exports = createPinRouter({ isAdmin: makeIsAdmin(), q: (...a) => E.q(...a) })
