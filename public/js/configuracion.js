document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('formularioListas');
    
    form.addEventListener('submit', async function(event) {
        event.preventDefault();
        
        // Crear FormData para las imágenes
        const formData = new FormData();
        
        // Obtener las imágenes
        const imagenes = document.querySelectorAll('input[type="file"]');
        imagenes.forEach(input => {
            if (input.files[0]) {
                formData.append(input.id, input.files[0]);
            }
        });

        try {
            // Primero subir las imágenes
            const uploadResponse = await fetch('/uploadProvisionales', {
                method: 'POST',
                body: formData
            });

            const uploadResult = await uploadResponse.json();
            
            if (uploadResult.success) {
                // Si las imágenes se subieron correctamente, recopilar el resto de datos
                const periodo = document.getElementById('periodo').value;
                const fechaPublicacion = document.getElementById('fechaPublicacion').value;
                const horaInicio = document.getElementById('horaInicio').value;
                const horaFin = document.getElementById('horaFin').value;

                // Recopilar datos de las listas
                const listas = [];
                const numListas = document.querySelectorAll('.lista-container').length;

                for (let i = 1; i <= numListas; i++) {
                    const nombreLista = document.getElementById(`nombreLista${i}`).value;
                    const presidente = document.getElementById(`presidenteLista${i}`).value;
                    const vicepresidente = document.getElementById(`vicepresidenteLista${i}`).value;
                    const secretario = document.getElementById(`secretarioLista${i}`).value;
                    const tesorero = document.getElementById(`tesoreroLista${i}`).value;
                    const sindico = document.getElementById(`sindicoLista${i}`).value;

                    // Recopilar vocales principales
                    const vocalesPrincipales = [];
                    for (let j = 1; j <= 3; j++) {
                        const vocal = document.getElementById(`vocalPrincipal${j}Lista${i}`).value;
                        if (vocal) vocalesPrincipales.push(vocal);
                    }

                    // Recopilar vocales suplentes
                    const vocalesSuplentes = [];
                    for (let j = 1; j <= 3; j++) {
                        const vocal = document.getElementById(`vocalSuplente${j}Lista${i}`).value;
                        if (vocal) vocalesSuplentes.push(vocal);
                    }

                    listas.push({
                        nombreLista,
                        presidente,
                        vicepresidente,
                        secretario,
                        tesorero,
                        sindico,
                        vocalesPrincipales,
                        vocalesSuplentes
                    });
                }

                // Crear el objeto con todos los datos
                const formDataCompleto = {
                    periodo,
                    fechaPublicacion,
                    horaInicio,
                    horaFin,
                    listas
                };

                // Guardar en localStorage
                localStorage.setItem('formDataCompleto', JSON.stringify(formDataCompleto));
                
                alert('Datos guardados correctamente en localStorage');
                window.location.href = '/html/votacion.html';
            } else {
                alert('Error al subir las imágenes: ' + uploadResult.message);
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Error al procesar la solicitud: ' + error.message);
        }
    });
});

document.getElementById('btnGenerarFormulario').addEventListener('click', async function() {
    const formDataStr = localStorage.getItem('formDataCompleto');
    if (!formDataStr) {
        alert('No hay datos para generar el formulario. Por favor, complete y envíe el formulario primero.');
        return;
    }

    try {
        const formDataCompleto = JSON.parse(formDataStr);
        const response = await fetch('/guardar-candidatos', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formDataCompleto)
        });

        if (response.ok) {
            alert('Datos guardados correctamente');
            localStorage.removeItem('formDataCompleto');
            MensajeGeneracion(formDataCompleto.periodo);
        } else {
            const errorText = await response.text();
            alert('Error al guardar los datos: ' + errorText);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error al procesar la solicitud: ' + error.message);
    }
});

function MensajeGeneracion(periodo) {
    const mensaje = document.getElementById('mensajeGeneracion');
    mensaje.innerHTML = `
        <div class="alert alert-success" role="alert">
            <h4 class="alert-heading">¡Formulario generado exitosamente!</h4>
            <p>El formulario ha sido generado correctamente. Los votantes pueden acceder mediante el siguiente enlace:</p>
            <hr>
            <p class="mb-0"><a href="/votacion.html?periodo=${periodo}" target="_blank">/votacion.html?periodo=${periodo}</a></p>
        </div>
    `;
    mensaje.style.display = 'block';
} 