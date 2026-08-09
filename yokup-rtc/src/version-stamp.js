// Lo REESCRIBE deploy.sh en cada publicación. No se teclea: un sello a mano es un
// sello que un día no coincide con lo que hay publicado. Un worker sin sellar lo dice
// en /version.json en vez de inventarse una versión.
export const SELLO_WORKER = {
  version: null, deployedAt: null, deployer: null, machine: null,
  signature: null, git: null, gitShort: null, dirty: null
};
