// Editorial source. Images are always generated from the real product by the separate guide journey.
const step = (title, image, action, result, controls = []) => ({ title, image, action, result, controls });
export const adminGuide = {
  file: '01_MANUAL_ADMIN',
  title: 'Cómo preparar un salón',
  audience: 'Para el administrador de InvitacionesPremium',
  intro: 'Prepara la cuenta del salón, entrega el evento al encargado y comprueba que la recepción está lista.',
  note: 'Ejemplo ficticio: Salón Jardines del Lago. Dos eventos de 30 personas, sin Mesas. El salón registra a sus invitados y prepara a recepción; InvitacionesPremium configura y activa cada evento.',
  sections: [
    {
      title: 'De la cuenta a la recepción',
      steps: [
        step(
          'Entra al panel',
          'admin-00-entrar',
          'Abre el panel administrativo con la dirección que utilizas habitualmente. Escribe tu correo y contraseña y selecciona «Entrar al panel».',
          'Ves la navegación de administración.',
          ['Entrar al panel']
        ),
        step(
          'Crea la cuenta del salón',
          'admin-01-clientes',
          'Abre «Clientes» y selecciona «Crear organizacion».',
          'Se abre el formulario de alta del salón.',
          ['Crear organizacion']
        ),
        step(
          'Elige el servicio gestionado',
          'admin-02-crear-salon',
          'Completa el nombre del salón, el correo de su administrador y la contraseña inicial. Conserva «Gestionado por InvitacionesPremium» y selecciona «Crear organizacion».',
          'Se abre la ficha del salón. Entrega las credenciales al responsable por un medio privado.',
          ['Crear organizacion']
        ),
        step(
          'Revisa los siguientes pasos',
          'admin-03-preparar-salon',
          'Busca «Preparar salón para control de acceso».',
          'La guía indica que necesitas agregar un responsable antes de crear el evento.'
        ),
        step(
          'Agrega al responsable del salón',
          'admin-03b-responsable',
          'Selecciona «Agregar planner», escribe el correo del coordinador y una contraseña temporal. Después, selecciona «Guardar».',
          'El correo aparece en la lista de usuarios del salón. Entrega su acceso de forma privada.',
          ['Agregar planner', 'Guardar']
        ),
        step(
          'Crea el evento con lista de invitados',
          'admin-04-crear-evento',
          'Selecciona «Crear evento». Escribe el nombre, elige la opción nominal en «Modalidad de acceso», indica capacidad 30 y selecciona al responsable. Confirma con «Crear evento».',
          'Se abre la preparación del evento. Esta opción usa un código por persona registrada.',
          ['Crear evento']
        ),
        step(
          'Crea un evento de pases numerados',
          'admin-04-crear-evento-numerados',
          'Para trabajar sin nombres, crea otro evento y elige la opción anónima en «Modalidad de acceso». Completa capacidad y responsable; selecciona «Crear evento».',
          'El evento utilizará pases con folios. Cada evento conserva una sola modalidad.',
          ['Crear evento']
        ),
        step(
          'Completa los datos generales',
          'admin-05-preparar-evento',
          'Elige el tipo de evento y completa fecha, hora y zona horaria. Selecciona «Guardar datos».',
          'Aparece «Datos guardados.». Verifica que la fecha y la hora sean las acordadas.',
          ['Guardar datos']
        ),
        step(
          'Revisa qué falta y quién lo prepara',
          'admin-06-requisitos',
          'Abre «Accesos» y revisa los requisitos pendientes.',
          'En un evento con lista, el salón debe registrar invitados y emitir sus códigos. InvitacionesPremium completa los datos y prepara el Croquis si se acordó.'
        ),
        step(
          'Prepara los pases numerados',
          'admin-07-pases-anonimos',
          'En el evento sin lista, escribe la cantidad en «Cantidad de pases» y selecciona «Generar lote».',
          'La confirmación muestra la cantidad y los folios creados. El salón puede revisarlos y descargarlos.',
          ['Generar lote']
        ),
        step(
          'Comprueba que todo está listo',
          'admin-07b-listo',
          'En «Accesos», comprueba que aparece «Accesos listos para activar.».',
          'No hay requisitos pendientes y el botón «Activar evento» está disponible. Si falta algo, resuélvelo con el responsable antes de continuar.',
          ['Activar evento']
        ),
        step(
          'Activa el evento',
          'admin-08-evento-activo',
          'Selecciona «Activar evento» y acepta la confirmación.',
          'Aparecen «El Evento quedó activo.» y «La activación ya fue realizada.». El salón ya puede preparar accesos para recepción.',
          ['Activar evento']
        ),
        step(
          'Consulta los ingresos',
          'admin-09-aforo',
          'Abre el detalle del evento y busca «Ingresos y aforo». Selecciona «Actualizar» cuando necesites una lectura reciente.',
          'Ves ingresos, pendientes y cupo disponible. El ejemplo tiene 1 ingreso y 4 pendientes; tu panel muestra los valores de tu evento.',
          ['Actualizar']
        )
      ]
    }
  ]
};

export const salonGuide = {
  file: '02_MANUAL_SALON',
  title: 'Guía para recibir a tus invitados',
  audience: 'Para el encargado del salón, coordinación y recepción',
  intro: 'Sigue la parte que corresponda a tu evento: una lista con nombres o pases numerados.',
  note: 'El encargado o coordinador usa su cuenta. Recepción abre únicamente el enlace privado que le entrega el encargado para ese evento. Las franjas oscuras de las imágenes protegen contraseñas, enlaces y la vista de cámara.',
  sections: [
    {
      title: 'Parte A · Cuando tienes una lista de invitados',
      steps: [
        step(
          'Entra a tu cuenta',
          'salon-00-entrar',
          'Abre la dirección de acceso que te entregó InvitacionesPremium. Escribe tu correo y contraseña y selecciona «Iniciar sesión».',
          'Ves los eventos a los que tienes acceso.',
          ['Iniciar sesión']
        ),
        step(
          'Abre tu evento',
          'salon-01-eventos',
          'Selecciona «Boda de Mariana y Alejandro» o el nombre del evento que vas a preparar.',
          'Se abre el evento seleccionado. Comprueba su nombre antes de continuar.'
        ),
        step(
          'Revisa la guía de preparación',
          'salon-02-resumen',
          'En «Resumen», revisa las tareas de la lista de invitados.',
          'Ves qué preparar antes de pedir a InvitacionesPremium que active el evento.'
        ),
        step(
          'Agrega una persona',
          'salon-03-invitados',
          'En «Invitados», escribe el nombre y selecciona «Agregar». El teléfono es opcional en este tipo de evento.',
          'El nombre aparece en la lista. Repite para cada persona; cada una tendrá su propio código.',
          ['Agregar']
        ),
        step(
          'Importa una lista',
          'salon-04-importar',
          'Selecciona «Descargar plantilla», completa el archivo con tus invitados y cárgalo con «Importar lista». Revisa la vista previa y selecciona «Confirmar importación».',
          'Las filas válidas se agregan a tu lista. Corrige las filas señaladas antes de confirmar. Conserva los encabezados de la plantilla.',
          ['Descargar plantilla', 'Importar lista', 'Confirmar importación']
        ),
        step(
          'Prepara el código de cada persona',
          'salon-05-emitir',
          'Abre «Credenciales individuales» y selecciona «Emitir credencial» junto a cada invitado.',
          'Aparece «Credencial vigente» para esa persona. Comprueba que no quede nadie pendiente de emisión.',
          ['Emitir credencial']
        ),
        step(
          'Selecciona los códigos para imprimir',
          'salon-06-material',
          'Selecciona «Seleccionar todos los descargables» y después «Exportar seleccionados a PDF». También puedes marcar personas por separado.',
          'Se descarga el archivo con los códigos seleccionados. Imprime el PDF y entrega a cada persona su propio código. Solicita la activación cuando la lista esté completa.',
          ['Seleccionar todos los descargables', 'Exportar seleccionados a PDF']
        ),
        step(
          'Prepara a recepción',
          'salon-09-staff',
          'Con el evento activo, abre «Staff», escribe un nombre como «Recepción principal» en «Alias del acceso» y selecciona «Crear acceso».',
          'Aparece un acceso para ese evento. Puedes tener hasta tres accesos activos.',
          ['Crear acceso']
        ),
        step(
          'Entrega el enlace al personal autorizado',
          'salon-09b-compartir',
          'Selecciona «Copiar enlace» y envíalo de forma privada a la persona de recepción. También puedes usar «Abrir Scanner» en ese dispositivo.',
          'Recepción puede abrir el lector del evento. Guarda y entrega el enlace en ese momento: al ocultarlo o recargar ya no podrás recuperarlo.',
          ['Copiar enlace', 'Abrir Scanner']
        ),
        step(
          'Abre el lector de códigos',
          'salon-10-scanner',
          'En el teléfono de recepción, abre el enlace recibido y permite el uso de la cámara.',
          'El Scanner muestra el evento y la vista de cámara. Apunta al código de la persona; necesitas conexión a internet.'
        ),
        step(
          'Comprueba el ingreso',
          'salon-11-ingreso',
          'Espera el aviso de ingreso registrado y comprueba el nombre. Selecciona «Siguiente escaneo» para atender a otra persona.',
          'El ingreso queda registrado una sola vez. Si aparece un rechazo, consulta al encargado antes de permitir la entrada.',
          ['Siguiente escaneo']
        ),
        step(
          'Revisa quién falta por llegar',
          'salon-12-aforo',
          'Desde tu cuenta, abre «Ingresos y aforo» y revisa «Ingresados» y «Pendientes».',
          'Ves cuántas personas llegaron y cuántas faltan. «Capacidad disponible» es cupo para emitir más códigos; no significa personas que faltan por llegar.'
        )
      ]
    },
    {
      title: 'Parte B · Cuando trabajas con pases numerados',
      steps: [
        step(
          'Abre el evento de pases',
          'salon-01-eventos',
          'Desde la lista de eventos, selecciona «Celebración empresarial» o el nombre de tu evento con pases.',
          'Se abre el evento correcto; no necesitas registrar nombres.'
        ),
        step(
          'Revisa los pases preparados',
          'salon-07-pases',
          'Abre «Pases físicos» y revisa los folios.',
          'Cada folio indica si está sin usar, utilizado o revocado. InvitacionesPremium prepara los lotes; solicita más pases si los necesitas.'
        ),
        step(
          'Descarga e imprime los pases',
          'salon-06-material-numerados',
          'Selecciona «Seleccionar todos los descargables» y luego «Exportar seleccionados a PDF».',
          'Se descarga el material seleccionado. Imprime una copia por pase y distribúyela de forma controlada.',
          ['Seleccionar todos los descargables', 'Exportar seleccionados a PDF']
        ),
        step(
          'Identifica los números disponibles',
          'salon-07-pases',
          'Busca los folios que dicen «Sin usar».',
          'Puedes distinguir los pendientes de los utilizados y revocados. Un pase revocado no permite entrar; un pase utilizado no admite otro ingreso.'
        ),
        step(
          'Da acceso a recepción',
          'salon-09b-compartir-numerados',
          'Con el evento activo, abre «Staff», crea un acceso con el alias de recepción y selecciona «Copiar enlace». Entrégalo de forma privada al personal autorizado.',
          'Recepción recibe un enlace exclusivo de ese evento. Consérvalo antes de ocultarlo o recargar.',
          ['Copiar enlace']
        ),
        step(
          'Escanea un pase',
          'salon-10-scanner-numerados',
          'Abre el enlace de recepción, permite la cámara y apunta al QR del pase.',
          'El lector consulta el pase del evento. Mantén conexión a internet y espera el resultado.'
        ),
        step(
          'Comprueba el folio registrado',
          'salon-11-ingreso-numerados',
          'Comprueba el aviso de ingreso registrado y el número del pase. Selecciona «Siguiente escaneo».',
          'El pase queda utilizado. Si el lector rechaza el pase, pide ayuda al encargado.',
          ['Siguiente escaneo']
        ),
        step(
          'Revisa cuántas personas ingresaron',
          'salon-12-aforo-numerados',
          'Desde tu cuenta, abre «Ingresos y aforo».',
          '«Ingresados» cuenta los pases utilizados y «Pendientes» los pases vigentes sin usar. El ejemplo muestra 1 utilizado, 4 pendientes y un folio revocado en el historial.'
        )
      ]
    }
  ],
  closing:
    '¿Tu evento utiliza Mesas? Pide a InvitacionesPremium que prepare el Croquis antes de activar. Esta guía muestra eventos sin Mesas. Para un evento con Croquis, solicita la guía de acomodo correspondiente antes de preparar los códigos.'
};

export const usabilityTasks = [
  ['Con una lista de invitados', 'Abre el evento de la boda.'],
  ['Con una lista de invitados', 'Agrega a una persona a tu lista de invitados.'],
  ['Con una lista de invitados', 'Importa la lista de prueba que te entregue el evaluador.'],
  ['Con una lista de invitados', 'Prepara el código de entrada de una persona.'],
  ['Con una lista de invitados', 'Prepara el material de esa persona para imprimir.'],
  ['Con un evento activo', 'Prepara un acceso para la recepción.'],
  ['Con un evento activo', 'Registra un ingreso con el teléfono de recepción y el material de prueba.'],
  ['Con un evento activo', 'Encuentra cuántas personas faltan por llegar.'],
  ['Con pases numerados', 'Encuentra un pase que todavía pueda utilizarse.'],
  ['Con pases numerados', 'Prepara los pases disponibles para imprimir.']
];
