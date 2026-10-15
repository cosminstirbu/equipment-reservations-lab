function endpoint(name) {
  const value = process.env[`services__${name}__http__0`];
  if (!value) throw new Error(`Aspire did not supply ${name} endpoint.`);
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  )
    throw new Error('Only local HTTP targets are allowed.');
  return value;
}
module.exports = Object.fromEntries(
  [
    ['/api/equipment', 'inventory'],
    ['/api/hellos', 'reservations'],
    ['/api/availability', 'reservations'],
    ['/api/reservations', 'reservations'],
    ['/api/notifications', 'notifications'],
  ].flatMap(([path, resource]) =>
    [path, `${path}/**`].map((pattern) => [
      pattern,
      {
        target: endpoint(resource),
        changeOrigin: false,
        timeout: 5000,
        proxyTimeout: 5000,
      },
    ]),
  ),
);
