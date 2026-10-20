const { test } = require('node:test');
const assert = require('node:assert/strict');
const { publicConfiguration } = require('./auth-config.cjs');

const configuration = (issuer) => ({
  Identity__Authority: issuer,
  Identity__Realm: 'equipment',
  Identity__ClientId: 'equipment-web',
});

test('canonical HTTPS public issuer is available to the production frontend', () => {
  const issuer = 'https://identity.equipment.test/realms/equipment';
  assert.equal(publicConfiguration(configuration(issuer)).issuer, issuer);
});

test('HTTP is restricted to canonical loopback and malformed issuers fail', () => {
  for (const issuer of [
    'http://identity.equipment.test/realms/equipment',
    'https://identity.equipment.test/realms/equipment?secret=hidden',
    'https://user@identity.equipment.test/realms/equipment',
    'https://identity.equipment.test/realms/equipment/',
    'http://127.1/realms/equipment',
  ])
    assert.throws(() => publicConfiguration(configuration(issuer)));
  assert.equal(
    publicConfiguration(
      configuration('http://localhost:18080/realms/equipment'),
    ).realm,
    'equipment',
  );
});
