export default {
  // Forward /api/* to the dzingel-api worker through the service binding.
  fetch: (req: Request, env: { API: Fetcher }) => env.API.fetch(req),
};
