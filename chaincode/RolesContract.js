'use strict';

const { Contract } = require('fabric-contract-api');

class RolesContract extends Contract {
  async initLedger(ctx) {
    console.info('============= START : Initialize Ledger ===========');
    const roles = [
      {
        id: 'prueba1',
        nombre_rol: 'prueba1',
        crear_votacion: 1,
        ver_resultados: 1
      },
      {
        id: 'prueba2',
        nombre_rol: 'prueba2',
        crear_votacion: 0,
        ver_resultados: 1
      }
    ];

    for (let i = 0; i < roles.length; i++) {
      await ctx.stub.putState(`ROLE${i}`, Buffer.from(JSON.stringify(roles[i])));
      console.info(`Role ${i} initialized`);
    }
    console.info('============= END : Initialize Ledger ===========');
  }

  async queryRole(ctx, roleId) {
    const roleAsBytes = await ctx.stub.getState(roleId);
    if (!roleAsBytes || roleAsBytes.length === 0) {
      throw new Error(`${roleId} does not exist`);
    }
    console.log(roleAsBytes.toString());
    return roleAsBytes.toString();
  }

  async createRole(ctx, id, nombre_rol, crear_votacion, ver_resultados) {
    console.info('============= START : Create Role ===========');

    const role = {
      id,
      nombre_rol,
      crear_votacion,
      ver_resultados
    };

    await ctx.stub.putState(id, Buffer.from(JSON.stringify(role)));
    console.info('============= END : Create Role ===========');
  }
}

module.exports = RolesContract;
