const timer = document.createElement('div')

timer.innerText = '🔴 Recording...'

timer.style.position = 'fixed'
timer.style.top = '20px'
timer.style.right = '20px'
timer.style.zIndex = '999999'
timer.style.background = 'red'
timer.style.color = 'white'
timer.style.padding = '10px'
timer.style.borderRadius = '10px'

document.body.appendChild(timer)