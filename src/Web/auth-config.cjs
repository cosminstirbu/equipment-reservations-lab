module.exports.publicConfiguration = (environment) => {
  const issuer = environment.Identity__Authority;
  const realm = environment.Identity__Realm;
  const clientId = environment.Identity__ClientId;
  if (
    typeof issuer !== 'string' ||
    realm !== 'equipment' ||
    clientId !== 'equipment-web'
  ) {
    throw new Error('Public identity configuration is required.');
  }

  const authority = new URL(issuer);
  if (
    (authority.protocol !== 'https:' &&
      !(
        authority.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(authority.hostname)
      )) ||
    authority.href !== issuer ||
    authority.pathname !== '/realms/equipment' ||
    authority.search ||
    authority.hash ||
    authority.username ||
    authority.password
  ) {
    throw new Error(
      'Identity authority must be canonical HTTPS or loopback HTTP.',
    );
  }

  return { issuer, realm, clientId };
};
