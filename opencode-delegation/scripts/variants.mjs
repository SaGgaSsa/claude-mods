// Prints the models.dev entries of the models named as arguments, trimmed to
// `reasoning_options`, in the API's own shape: { provider: { models: { id: ... } } }.
// The full API is about 6 MB, more than the mod can take in one call, so node
// downloads it and hands the mod only these few entries.
const response = await fetch('https://models.dev/api.json')
if (!response.ok) {
  console.error(`models.dev answered ${response.status}`)
  process.exit(1)
}
const api = await response.json()

const trimmed = {}
for (const model of process.argv.slice(2)) {
  const slash = model.indexOf('/')
  if (slash === -1) continue
  const provider = model.slice(0, slash)
  const id = model.slice(slash + 1)
  const entry = api[provider]?.models?.[id]
  if (!entry) continue
  trimmed[provider] ??= { models: {} }
  trimmed[provider].models[id] = { reasoning_options: entry.reasoning_options }
}
console.log(JSON.stringify(trimmed))
