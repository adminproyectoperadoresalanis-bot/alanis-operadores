// ============================================================
// AUTOTRANSPORTES ALANÍS — Catálogo de fallas
// ============================================================

const FALLAS = [
  // Sistema de aire
  { id:1,  cat:'Sistema de aire',        name:'Fuga de aire en frenos',              sev:'alta'  },
  { id:2,  cat:'Sistema de aire',        name:'Fuga de aire en mangueras',           sev:'alta'  },
  { id:3,  cat:'Sistema de aire',        name:'Compresor de aire defectuoso',        sev:'alta'  },
  { id:4,  cat:'Sistema de aire',        name:'Válvula de seguridad dañada',         sev:'media' },
  { id:5,  cat:'Sistema de aire',        name:'Cámara de freno dañada',              sev:'alta'  },
  // Llantas
  { id:6,  cat:'Llantas',                name:'Llanta desgastada o en mal estado',   sev:'alta'  },
  { id:7,  cat:'Llantas',                name:'Llanta ponchada o baja de presión',   sev:'alta'  },
  { id:8,  cat:'Llantas',                name:'Rin doblado o dañado',                sev:'media' },
  { id:9,  cat:'Llantas',                name:'Tuercas flojas o faltantes',          sev:'alta'  },
  { id:10, cat:'Llantas',                name:'Llanta de refacción sin presión',     sev:'baja'  },
  // Dirección y suspensión
  { id:11, cat:'Dirección / Suspensión', name:'Problemas de alineación',             sev:'media' },
  { id:12, cat:'Dirección / Suspensión', name:'Dirección dura o con juego excesivo', sev:'alta'  },
  { id:13, cat:'Dirección / Suspensión', name:'Amortiguadores en mal estado',        sev:'media' },
  { id:14, cat:'Dirección / Suspensión', name:'Resortes rotos o dañados',            sev:'media' },
  { id:15, cat:'Dirección / Suspensión', name:'Rótulas o terminales desgastadas',    sev:'media' },
  { id:16, cat:'Dirección / Suspensión', name:'Barra de dirección doblada',          sev:'alta'  },
  // Sistema eléctrico
  { id:17, cat:'Sistema eléctrico',      name:'Falla en sistema eléctrico general',  sev:'alta'  },
  { id:18, cat:'Sistema eléctrico',      name:'Luces delanteras defectuosas',        sev:'media' },
  { id:19, cat:'Sistema eléctrico',      name:'Luces traseras o direccionales',      sev:'media' },
  { id:20, cat:'Sistema eléctrico',      name:'Batería descargada o dañada',         sev:'alta'  },
  { id:21, cat:'Sistema eléctrico',      name:'Alternador defectuoso',               sev:'alta'  },
  { id:22, cat:'Sistema eléctrico',      name:'Falla en tablero de instrumentos',    sev:'media' },
  { id:23, cat:'Sistema eléctrico',      name:'Corto circuito',                      sev:'alta'  },
  // Motor
  { id:24, cat:'Motor',                  name:'Recalentamiento del motor',           sev:'alta'  },
  { id:25, cat:'Motor',                  name:'Fuga de aceite de motor',             sev:'alta'  },
  { id:26, cat:'Motor',                  name:'Fuga de agua o anticongelante',       sev:'alta'  },
  { id:27, cat:'Motor',                  name:'Humo excesivo en escape',             sev:'media' },
  { id:28, cat:'Motor',                  name:'Pérdida de potencia',                 sev:'media' },
  { id:29, cat:'Motor',                  name:'Ruido inusual en motor',              sev:'media' },
  { id:30, cat:'Motor',                  name:'Falla en sistema de enfriamiento',    sev:'alta'  },
  // Frenos
  { id:31, cat:'Frenos',                 name:'Frenos en mal estado general',        sev:'alta'  },
  { id:32, cat:'Frenos',                 name:'Balatas o tambores desgastados',      sev:'alta'  },
  { id:33, cat:'Frenos',                 name:'Freno de mano sin funcionar',         sev:'media' },
  { id:34, cat:'Frenos',                 name:'Pedal de freno esponjoso',            sev:'alta'  },
  // Transmisión
  { id:35, cat:'Transmisión',            name:'Falla en caja de velocidades',        sev:'alta'  },
  { id:36, cat:'Transmisión',            name:'Fuga de aceite de transmisión',       sev:'media' },
  { id:37, cat:'Transmisión',            name:'Clutch desgastado o dañado',          sev:'media' },
  { id:38, cat:'Transmisión',            name:'Ruido en caja de velocidades',        sev:'media' },
  // Carrocería y cabina
  { id:39, cat:'Carrocería / Cabina',    name:'Parabrisas roto o fisurado',          sev:'media' },
  { id:40, cat:'Carrocería / Cabina',    name:'Espejo retrovisor dañado',            sev:'baja'  },
  { id:41, cat:'Carrocería / Cabina',    name:'Puerta o manija en mal estado',       sev:'baja'  },
  { id:42, cat:'Carrocería / Cabina',    name:'Asiento del operador dañado',         sev:'baja'  },
  { id:43, cat:'Carrocería / Cabina',    name:'Cinturón de seguridad defectuoso',    sev:'alta'  },
  { id:44, cat:'Carrocería / Cabina',    name:'Escalón de acceso dañado',            sev:'baja'  },
  // Combustible
  { id:45, cat:'Combustible',            name:'Fuga de combustible',                 sev:'alta'  },
  { id:46, cat:'Combustible',            name:'Tapón de depósito dañado',            sev:'baja'  },
  { id:47, cat:'Combustible',            name:'Consumo excesivo de combustible',     sev:'media' },
  { id:48, cat:'Combustible',            name:'Filtro de combustible saturado',      sev:'media' },
  // Quinta rueda y acople
  { id:49, cat:'Quinta rueda / Acople',  name:'Quinta rueda en mal estado',          sev:'alta'  },
  { id:50, cat:'Quinta rueda / Acople',  name:'King pin desgastado',                 sev:'alta'  },
  { id:51, cat:'Quinta rueda / Acople',  name:'Cables y mangueras de acople dañados',sev:'media' },
  { id:52, cat:'Quinta rueda / Acople',  name:'Seguro de quinta rueda defectuoso',   sev:'alta'  },
  // Otros
  { id:53, cat:'Otros',                  name:'Limpiadores (wipers) defectuosos',    sev:'baja'  },
  { id:54, cat:'Otros',                  name:'Bocina inoperante',                   sev:'baja'  },
  { id:55, cat:'Otros',                  name:'Aire acondicionado sin funcionar',    sev:'baja'  },
  { id:56, cat:'Otros',                  name:'GPS o rastreador con falla',          sev:'media' },
  { id:57, cat:'Otros',                  name:'Extintor vencido o ausente',          sev:'alta'  },
  { id:58, cat:'Otros',                  name:'Triángulos de seguridad faltantes',   sev:'media' },
];
