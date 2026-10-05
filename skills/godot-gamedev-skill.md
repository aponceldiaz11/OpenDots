# Godot GameDev Skill

Arquitectura de nodos, GDScript y patrones para juegos de estrategia por turnos
y puzles móviles.

## Arquitectura de escenas

- `Main` (Node2D/Control) → `World` + `UIManager` + `AudioBus`.
- Separa **datos** (Resources `.tres`) de **presentación** (nodos). Nunca metas
  reglas de juego en `_process`.
- Autoloads: `GameState`, `EventBus`, `SaveManager`. Comunica sistemas por
  señales del `EventBus`, no por referencias cruzadas.

## Máquinas de estados finitos (FSM)

```
StateMachine (Node)
  └── State (Node)  # enter(), exit(), handle_input(), update(delta)
```

- Un estado por archivo; transiciones explícitas (`change_state(name)`).
- Para turnos: `Idle → SelectUnit → SelectTarget → ResolveAction → EnemyTurn`.

## Grid y turnos

- Modela el tablero como `Array`/`Dictionary` de celdas con coordenadas `Vector2i`.
- `AStarGrid2D` para pathfinding; cachea rutas por turno.
- Resolución determinista: separa cálculo (puro, testeable) de animación.
- RNG con semilla (`RandomNumberGenerator.seed`) para reproducibilidad.

## Puzles móviles

- Input táctil: `_input(event)` con `InputEventScreenTouch/Drag`; soporta gestos
  y ratón a la vez (`emulate_mouse_from_touch`).
- Guardado incremental en `user://` con `ConfigFile` o JSON versionado.
- Escalado: `Control` + `anchors_preset`, `stretch_mode = canvas_items`.

## Rendimiento

- Objetos de escena reciclables (pooling) para tableros grandes.
- Evita `get_node` en bucles; cachea referencias con `@onready`.
- Perfila con el Monitor; objetivo 60 FPS en gama media.
