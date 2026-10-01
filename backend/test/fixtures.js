// Trimmed real responses of GET https://api.renaissos.com/v1/search (2026-10-02) for a few cards of the "151" set.
const hit = (o) => ({ variation: null, rarity: null, confidence: 'low', lastSaleAt: '2026-09-20T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z', language: 'English', gradeLabel: 'PSA 10', ...o })

exports.charizardSearch = [
  hit({ name: 'Charizard EX', setName: 'Pokémon 151', cardNumber: '199', rarity: 'Special Illustration Rare', priceUsdCents: 140507, confidence: 'high', lastSaleAt: '2026-09-28T00:00:00.000Z', href: '/card/pokemon/pokemon-151/199-charizard-ex-psa-10-7cb6e9ea' }),
  hit({ name: 'Cameron Ward', setName: 'Prizm Draft Picks', cardNumber: '199', variation: 'Red Ice', priceUsdCents: 7568, href: '/card/sports/prizm-draft-picks/199-cameron-ward-psa-10-0905201f' }),
  hit({ name: 'Cornerstone Mask Ogerpon ex', setName: 'Twilight Masquerade', cardNumber: '199', priceUsdCents: 5218, href: '/card/pokemon/twilight-masquerade/199-cornerstone-mask-ogerpon-ex-psa-10-cfbf4726' }),
  hit({ name: 'Prodigal Explorer', setName: 'Spiritforged', cardNumber: '199', gradeLabel: 'Raw B', priceUsdCents: 28, href: '/card/riftbound/spiritforged/199-prodigal-explorer-raw-B-0ec3d5f3' }),
]

// "Pikachu 151 025": the right card is the LAST of the hits, so taking the first hit would be wrong.
exports.pikachuSearch = [
  hit({ name: 'Pikachu', setName: '30th Celebration', cardNumber: '25', gradeLabel: 'Raw A', priceUsdCents: 95, confidence: 'high', href: '/card/pokemon/30th-celebration/25-pikachu-raw-A-38498f06' }),
  hit({ name: 'Pikachu', setName: '30th Celebration', cardNumber: '25', language: 'Japanese', gradeLabel: 'Raw A', priceUsdCents: 364, confidence: 'medium', href: '/card/pokemon/30th-celebration/25-pikachu-raw-A-japanese-5b8' }),
  hit({ name: 'Pikachu', setName: 'Pikachu World Collection', cardNumber: '025', language: 'Korean', gradeLabel: 'BGS 10 Pristine', priceUsdCents: 25800, href: '/card/pokemon/pikachu-world-collection/025-pikachu-bgs-10-ko' }),
  hit({ name: 'Pikachu', setName: 'Pokémon 151', cardNumber: '25', priceUsdCents: 18462, href: '/card/pokemon/pokemon-151/25-pikachu-psa-10-3b330bb8' }),
]

// "Blastoise ex 151 200": same number in other languages / sets
exports.blastoiseSearch = [
  hit({ name: 'Blastoise Ex', setName: 'Pokémon 151', cardNumber: '200', rarity: 'Special Illustration Rare', priceUsdCents: 51679, confidence: 'medium', href: '/card/pokemon/pokemon-151/200-blastoise-ex-psa-10-f0d8e2ae' }),
  hit({ name: 'Blastoise ex', setName: 'Pokémon 151', cardNumber: '200', language: 'Spanish', priceUsdCents: null, confidence: null, href: '/card/pokemon/pokemon-151/200-blastoise-ex-psa-10-spanish-99' }),
  hit({ name: 'Venusaur ex', setName: 'Pokémon Card 151', cardNumber: '200', language: 'Japanese', priceUsdCents: 15269, confidence: 'high', href: '/card/pokemon/pokemon-card-151/200-venusaur-ex-psa-10-japane' }),
  hit({ name: 'Dragapult ex', setName: 'Twilight Masquerade', cardNumber: '200', priceUsdCents: 4230, href: '/card/pokemon/twilight-masquerade/200-dragapult-ex-psa-10-8e' }),
]
