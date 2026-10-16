module.exports.publicConfiguration = (environment) => {
  const issuer = environment.Identity__Authority;
  const realm = environment.Identity__Realm;
  const clientId = environment.Identity__ClientId;
  if (
    typeof issuer !== 'string' ||
    realm !== 'equipment' ||
    clientId !== 'equipment-web'
  ) {
    throw new Error('Aspire must supply public identity configuration.');
  }

  const authority = new URL(issuer);
  if (
    !['http:', 'https:'].includes(authority.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(authority.hostname) ||
    authority.pathname !== '/realms/equipment' ||
    authority.search ||
    authority.hash ||
    authority.username ||
    authority.password
  ) {
    throw new Error('Only the local identity authority is allowed.');
  }

  return { issuer, realm, clientId };
};
