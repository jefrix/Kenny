"""Builds every Clay & Thunder model and exports it as a GLB into gods/models.

Run with any Blender (4.2 or newer):
    blender --background --python gods/tools/build_models.py
or with the bpy module:
    python gods/tools/build_models.py

Blender is Z up with +Y as "forward"; the glTF exporter converts to Three.js axes.
One unit is one cell of the game's terrain grid. A material named "team" is tinted
with the tribe's colour in the game. Everything else keeps its colour.
"""
import math
import os
import random

import bpy  # Must come first: the standalone module adds bmesh and mathutils to the path.
import bmesh
from mathutils import Vector

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "models"))

PALETTE = {
    "brick": "#b98a5a", "brick_dark": "#8f6340", "brick_light": "#d4ab78", "plaster": "#e2c9a0",
    "wood": "#5f4028", "wood_light": "#8a6238", "reed": "#c9a860", "shadow": "#2a1c14",
    "stone": "#8a8476", "stone_dark": "#5f5a50", "cedar": "#4f8a4e", "cedar_dark": "#3a6f42",
    "palm": "#5c8f3f", "palm_dark": "#44722f", "bark": "#6b4c30", "skin": "#b57a4c", "hair": "#21160f",
    "linen": "#e8dcc0", "bronze": "#b5813a", "gold": "#e6b43a", "clay_hand": "#d9915a",
    "clay_hand_dark": "#b06d3f", "ember": "#ff9a2e", "cloud": "#fff6e8", "team": "#ffffff", "ash": "#3a342e", "soil": "#6d4c2c", "soil_dark": "#54391f", "ore": "#a9683a", "iron_dark": "#454b52", "flint": "#7c7a72",
}
materials = {}


def mat(name):
    if name not in materials:
        hex_value = PALETTE[name].lstrip("#")
        srgb = [int(hex_value[i:i + 2], 16) / 255 for i in (0, 2, 4)]
        linear = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        node = material.node_tree.nodes.get("Principled BSDF")
        node.inputs["Base Color"].default_value = (*linear, 1)
        node.inputs["Roughness"].default_value = 0.95
        materials[name] = material
    return materials[name]


def new_object(mesh_builder, material, location=(0, 0, 0), rotation=(0, 0, 0)):
    mesh = bpy.data.meshes.new("part")
    bm = bmesh.new()
    mesh_builder(bm)
    bm.to_mesh(mesh)
    bm.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = False
    obj = bpy.data.objects.new("part", mesh)
    obj.location = location
    obj.rotation_euler = rotation
    mesh.materials.append(mat(material))
    bpy.context.collection.objects.link(obj)
    return obj


def box(material, center, size, taper=1.0, rotation=(0, 0, 0), jitter=0.0):
    """A box resting on its centre. Taper shrinks the top face, for sloped mud walls."""
    def build(bm):
        result = bmesh.ops.create_cube(bm, size=1)
        for v in result["verts"]:
            v.co.x *= size[0]
            v.co.y *= size[1]
            v.co.z *= size[2]
            if v.co.z > 0:
                v.co.x *= taper
                v.co.y *= taper
            if jitter:
                v.co += Vector((random.uniform(-jitter, jitter), random.uniform(-jitter, jitter), random.uniform(-jitter, jitter)))
    return new_object(build, material, center, rotation)


def cylinder(material, center, radius, height, segments=6, top_radius=None, rotation=(0, 0, 0)):
    def build(bm):
        bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius,
                              radius2=radius if top_radius is None else top_radius, depth=height)
    return new_object(build, material, center, rotation)


def blob(material, center, scale, subdivisions=1, jitter=0.1):
    def build(bm):
        result = bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=1)
        for v in result["verts"]:
            v.co.x = v.co.x * scale[0] + random.uniform(-jitter, jitter) * scale[0]
            v.co.y = v.co.y * scale[1] + random.uniform(-jitter, jitter) * scale[1]
            v.co.z = v.co.z * scale[2] + random.uniform(-jitter, jitter) * scale[2]
    return new_object(build, material, center)


def beam(material, start, end, radius, segments=5):
    """A round post between two points."""
    a, b = Vector(start), Vector(end)
    direction = b - a
    obj = cylinder(material, (a + b) / 2, radius, direction.length, segments)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    return obj


def export(name, seed=None):
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f"{name}.glb"), export_format="GLB", use_selection=True,
                              export_apply=True, export_animations=False, export_cameras=False, export_lights=False,
                              export_yup=True, export_texcoords=False, export_materials="EXPORT")
    print(f"exported {name}")
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)


# ----- Dwellings -----

def door(x, y, width, height, rotation=0):
    box("shadow", (x, y, height / 2), (width, 0.12, height), rotation=(0, 0, rotation))


def roof_poles(half_x, y, z, count):
    for i in range(count):
        x = -half_x + (2 * half_x) * (i + 0.5) / count
        cylinder("wood", (x, y, z), 0.05, 0.3, 5, rotation=(math.pi / 2, 0, 0))


def hut():
    random.seed(3)
    box("brick", (0, 0, 0.45), (1.9, 1.7, 0.9), taper=0.92, jitter=0.02)
    box("brick_light", (0, 0, 0.94), (1.86, 1.66, 0.1))
    door(0, -0.82, 0.42, 0.62)
    roof_poles(0.75, -0.9, 0.9, 5)
    # Awning in the tribe's colour, on two poles.
    box("team", (0, -1.1, 0.74), (1.0, 0.62, 0.05), rotation=(math.radians(-14), 0, 0))
    for x in (-0.46, 0.46):
        beam("wood_light", (x, -1.36, 0), (x, -1.36, 0.68), 0.035)
    # Roof clutter gives it a lived-in silhouette.
    box("reed", (0.45, 0.3, 1.08), (0.6, 0.5, 0.18), taper=0.75)
    cylinder("brick_dark", (-0.62, 0.42, 1.12), 0.16, 0.28, 7, top_radius=0.09)
    cylinder("brick_dark", (1.08, -0.45, 0.15), 0.13, 0.3, 7, top_radius=0.08)
    export("hut")


def house():
    random.seed(5)
    box("brick", (0, 0, 0.7), (3.1, 2.8, 1.4), taper=0.94, jitter=0.02)
    box("plaster", (0, 0, 1.44), (3.0, 2.7, 0.1))
    box("brick_light", (0.35, 0.28, 2.05), (1.9, 1.75, 1.15), taper=0.94, jitter=0.02)
    box("plaster", (0.35, 0.28, 2.66), (1.86, 1.72, 0.09))
    door(-0.5, -1.33, 0.56, 0.86)
    box("shadow", (0.35, -0.6, 2.15), (0.38, 0.1, 0.5))
    box("shadow", (0.9, -1.33, 0.82), (0.36, 0.1, 0.34))
    roof_poles(1.3, -1.42, 1.3, 7)
    # Outside stair up to the roof terrace.
    for step in range(5):
        box("brick_dark", (-1.8, -0.75 + step * 0.32, 0.14 + step * 0.27), (0.56, 0.34, 0.28 + step * 0.54 * 0.5))
    # Canopy and banner carry the tribe's colour.
    box("team", (-0.72, 0.05, 1.82), (1.05, 1.1, 0.05), rotation=(0, math.radians(6), 0))
    for x, y in ((-1.2, -0.45), (-1.2, 0.55), (-0.25, -0.45)):
        beam("wood", (x, y, 1.45), (x, y, 1.85), 0.04)
    beam("wood", (1.18, 1.05, 2.7), (1.18, 1.05, 3.9), 0.04)
    box("team", (1.48, 1.05, 3.62), (0.58, 0.04, 0.42))
    cylinder("brick_dark", (1.72, -1.2, 0.18), 0.17, 0.36, 7, top_radius=0.1)
    cylinder("brick_dark", (1.3, -1.72, 0.14), 0.14, 0.28, 7, top_radius=0.09)
    export("house")


def site():
    """A building site: scaffold and a stack of mud bricks."""
    random.seed(9)
    for x, y in ((-0.9, -0.8), (0.9, -0.8), (-0.9, 0.8), (0.9, 0.8)):
        beam("wood_light", (x, y, 0), (x * 0.92, y * 0.92, 1.25), 0.05)
    beam("wood_light", (-0.9, -0.8, 0.8), (0.9, -0.8, 0.8), 0.04)
    beam("wood_light", (-0.9, 0.8, 0.8), (0.9, 0.8, 0.8), 0.04)
    beam("wood_light", (-0.9, -0.8, 0.8), (-0.9, 0.8, 0.8), 0.04)
    beam("wood_light", (0.9, -0.8, 0.8), (0.9, 0.8, 0.8), 0.04)
    for i in range(7):
        box("brick", (random.uniform(-0.45, 0.45), random.uniform(-0.45, 0.45), 0.09 + (i % 3) * 0.17), (0.42, 0.26, 0.16),
            rotation=(0, 0, random.uniform(0, 0.5)))
    export("site")


def rubble():
    random.seed(11)
    for _ in range(11):
        angle, distance = random.uniform(0, 6.28), random.uniform(0, 0.95)
        size = random.uniform(0.25, 0.6)
        box(random.choice(["brick_dark", "ash", "brick", "ash"]), (math.cos(angle) * distance, math.sin(angle) * distance, size * 0.25),
            (size, size * 0.8, size * 0.5), rotation=(random.uniform(-0.4, 0.4), random.uniform(-0.4, 0.4), random.uniform(0, 3)))
    beam("ash", (-0.4, -0.3, 0), (0.25, 0.3, 0.75), 0.05)
    export("rubble")


# ----- The temple: a three-stepped ziggurat with a central stair -----

def temple_model(name, tier_count, crown=False):
    """A ziggurat that gains terraces with each age. The Iron Age adds gold and two obelisks."""
    random.seed(7)
    tiers = [(8.0, 1.5, "brick"), (5.8, 1.35, "brick_light"), (3.8, 1.2, "brick")][:tier_count]
    if tier_count == 1:
        tiers = [(8.0, 1.2, "stone")]
    z = 0.0
    for size, height, material in tiers:
        box(material, (0, 0.25, z + height / 2), (size, size, height), taper=0.93, jitter=0.015)
        half = size / 2
        ribs = max(4, int(size * 1.2))
        if tier_count > 1:
            # Vertical buttress ribs, the signature of Mesopotamian brickwork.
            for i in range(ribs):
                offset = -half + size * (i + 0.5) / ribs
                if abs(offset) > 0.8:
                    box("brick_dark", (offset * 0.97, 0.25 - half * 0.99, z + height * 0.47), (0.2, 0.13, height * 0.88), taper=0.93)
                box("brick_dark", (-half * 0.99, 0.25 + offset * 0.97, z + height * 0.47), (0.13, 0.2, height * 0.88), taper=0.93)
                box("brick_dark", (half * 0.99, 0.25 + offset * 0.97, z + height * 0.47), (0.13, 0.2, height * 0.88), taper=0.93)
        # Each terrace is a plaster floor edged with a trim of the tribe's colour.
        floor = size * 0.94
        box("plaster" if tier_count > 1 else "stone_dark", (0, 0.25, z + height + 0.04), (floor * 0.97, floor * 0.97, 0.08))
        rim = 0.2
        trim = "gold" if crown and size < 5 else "team"
        for sign in (-1, 1):
            box(trim, (0, 0.25 + sign * (floor - rim) / 2, z + height + 0.1), (floor, rim, 0.2))
            box(trim, (sign * (floor - rim) / 2, 0.25, z + height + 0.1), (rim, floor, 0.2))
        z += height + 0.1
    # Grand stair from the ground to the top terrace.
    foot, top = -4.55, 0.25 - tiers[-1][0] / 2 + 0.1
    steps = 6 * tier_count + 3
    for i in range(steps):
        t = i / steps
        box("plaster" if tier_count > 1 else "stone_dark", (0, foot + t * (top - foot), (t * z + 0.2) / 2), (1.25, (top - foot) / steps + 0.02, t * z + 0.2))
    # Shrine.
    box("plaster", (0, 0.25, z + 0.7), (2.2, 2.2, 1.4), taper=0.92)
    box("team", (0, 0.25, z + 1.47), (2.45, 2.45, 0.14))
    box("shadow", (0, -0.86, z + 0.55), (0.65, 0.05, 1.1))
    for x in (-0.82, 0.82):
        cylinder("gold" if tier_count > 1 else "wood", (x, -1.0, z + 0.65), 0.1, 1.3, 7)
    # Horned crown and sacred fire basins.
    box("gold" if tier_count > 1 else "wood", (0, 0.25, z + 1.65), (0.75, 0.75, 0.18))
    for side in (-1, 1):
        beam("gold" if tier_count > 1 else "wood", (side * 0.2, 0.25, z + 1.7), (side * 0.72, 0.25, z + 2.45), 0.09)
    for x, y in ((-3.4, -3.1), (3.4, -3.1)):
        cylinder("bronze" if tier_count > 1 else "stone_dark", (x, y, tiers[0][1] + 0.25), 0.2, 0.42, 7, top_radius=0.38)
        blob("ember", (x, y, tiers[0][1] + 0.6), (0.22, 0.22, 0.32), jitter=0.04)
    # Flanking pillars with banners at the stair foot.
    for x in (-1.25, 1.25):
        cylinder("plaster" if tier_count > 1 else "wood", (x, -5.0, 0.9), 0.17, 1.8, 7)
        box("gold" if tier_count > 1 else "wood", (x, -5.0, 1.84), (0.42, 0.42, 0.1))
        box("team", (x, -5.2, 1.2), (0.3, 0.04, 0.95))
    if crown:
        for x in (-4.9, 4.9):
            box("iron_dark", (x, -3.6, 2.2), (0.7, 0.7, 4.4), taper=0.55)
            box("gold", (x, -3.6, 4.5), (0.42, 0.42, 0.34), taper=0.1)
        box("gold", (0, 0.25, z + 3.0), (0.3, 0.3, 0.9), taper=0.2)
    export(name)


# ----- Workplaces -----

def hut_reed():
    """A Stone Age home: a round reed hut with a thatched cone."""
    random.seed(13)
    cylinder("reed", (0, 0, 0.42), 1.0, 0.84, 9, top_radius=0.92)
    cylinder("wood_light", (0, 0, 1.15), 1.2, 0.72, 9, top_radius=0.12)
    door(0, -0.9, 0.42, 0.56)
    for x in (-0.3, 0.3):
        beam("wood", (x, -1.2, 0), (x, -1.2, 0.72), 0.03)
    box("team", (0, -1.2, 0.74), (0.72, 0.28, 0.04))
    export("hut_reed")


def farm():
    random.seed(15)
    box("soil", (0, 0, 0.04), (4.1, 4.1, 0.08))
    for row in range(6):
        y = -1.65 + row * 0.66
        box("soil_dark", (0, y, 0.1), (3.8, 0.2, 0.05))
        for i in range(10):
            x = -1.7 + i * 0.38 + random.uniform(-0.04, 0.04)
            height = random.uniform(0.32, 0.5)
            cylinder("reed" if row % 2 else "palm", (x, y, 0.1 + height / 2), 0.06, height, 4, top_radius=0.02)
    for x, y in ((-2.05, -2.05), (2.05, -2.05), (-2.05, 2.05), (2.05, 2.05)):
        beam("wood", (x, y, 0), (x, y, 0.5), 0.04)
    for a, b in (((-2.05, -2.05), (2.05, -2.05)), ((-2.05, 2.05), (2.05, 2.05)), ((-2.05, -2.05), (-2.05, 2.05)), ((2.05, -2.05), (2.05, 2.05))):
        beam("wood_light", (*a, 0.38), (*b, 0.38), 0.025)
    beam("wood", (-2.05, -2.05, 0), (-2.05, -2.05, 1.05), 0.04)
    box("team", (-1.82, -2.05, 0.88), (0.42, 0.03, 0.28))
    export("farm")


def mine():
    random.seed(17)
    blob("stone", (0, 0.45, 0.42), (1.5, 1.2, 0.95), subdivisions=2, jitter=0.1)
    box("shadow", (0, -0.8, 0.45), (0.86, 0.3, 0.9))
    for x in (-0.5, 0.5):
        beam("wood", (x, -0.98, 0), (x, -0.98, 1.05), 0.075)
    beam("wood", (-0.62, -0.98, 1.05), (0.62, -0.98, 1.05), 0.08)
    for i in range(5):
        blob("ore", (0.95 + random.uniform(-0.28, 0.28), -0.85 + random.uniform(-0.28, 0.28), 0.14), (0.16, 0.15, 0.14), jitter=0.2)
    box("wood_light", (-1.05, -0.95, 0.24), (0.55, 0.38, 0.26), taper=1.15)
    beam("wood", (0.3, -1.3, 0), (0.3, -1.3, 1.65), 0.035)
    box("team", (0.54, -1.3, 1.5), (0.46, 0.03, 0.3))
    export("mine")


def forge():
    random.seed(19)
    box("stone", (0, 0.35, 0.5), (2.5, 1.9, 1.0), taper=0.93, jitter=0.02)
    box("stone_dark", (0.75, 0.75, 1.42), (0.7, 0.7, 1.9), taper=0.68)
    box("ember", (-0.2, -0.61, 0.42), (0.74, 0.05, 0.42))
    box("wood", (-0.1, -0.1, 1.05), (2.3, 2.3, 0.1))
    for x in (-1.15, 0.35):
        beam("wood", (x, -1.45, 0), (x, -1.45, 0.98), 0.05)
    box("team", (-0.4, -1.1, 1.0), (1.8, 0.92, 0.05), rotation=(math.radians(-10), 0, 0))
    # Anvil on a stump.
    cylinder("wood", (0.72, -1.22, 0.15), 0.2, 0.3, 7)
    box("iron_dark", (0.72, -1.22, 0.38), (0.42, 0.17, 0.16), taper=0.76)
    export("forge")


def school():
    """The tablet house, where scribes press wedges into clay."""
    random.seed(23)
    box("plaster", (0, 0.2, 0.75), (3.0, 2.5, 1.5), taper=0.95, jitter=0.01)
    box("brick_light", (0, 0.2, 1.57), (3.25, 2.75, 0.14))
    door(0, -1.07, 0.6, 0.98)
    for x in (-1.15, -0.62, 0.62, 1.15):
        cylinder("brick_dark", (x, -1.34, 0.72), 0.09, 1.44, 7)
    box("brick_light", (0, -1.32, 1.5), (2.9, 0.42, 0.13))
    box("team", (0, -1.56, 1.2), (1.7, 0.04, 0.36))
    # Drying racks of clay tablets.
    for x in (-1.75, 1.75):
        box("wood", (x, -0.3, 0.42), (0.4, 1.4, 0.84))
        for i in range(4):
            box("brick_light", (x, -0.8 + i * 0.33, 0.9), (0.27, 0.24, 0.06))
    export("school")


def tower():
    random.seed(29)
    box("brick", (0, 0, 1.4), (1.8, 1.8, 2.8), taper=0.84, jitter=0.015)
    box("brick_light", (0, 0, 2.86), (1.9, 1.9, 0.14))
    for sign_x in (-1, 0, 1):
        for sign_y in (-1, 0, 1):
            if sign_x or sign_y:
                box("brick_dark", (sign_x * 0.82, sign_y * 0.82, 3.1), (0.3, 0.3, 0.36))
    box("shadow", (0, -0.88, 0.45), (0.46, 0.08, 0.9))
    beam("wood", (0, 0, 2.9), (0, 0, 4.4), 0.04)
    box("team", (0.32, 0, 4.15), (0.6, 0.03, 0.42))
    export("tower")


# ----- Nature -----

def cedar():
    random.seed(21)
    cylinder("bark", (0, 0, 0.55), 0.13, 1.1, 6, top_radius=0.07)
    for z, radius, material in ((0.9, 0.9, "cedar_dark"), (1.32, 0.72, "cedar"), (1.72, 0.48, "cedar"), (2.05, 0.26, "cedar")):
        blob(material, (random.uniform(-0.05, 0.05), random.uniform(-0.05, 0.05), z), (radius, radius, radius * 0.42), jitter=0.08)
    export("cedar")


def palm():
    random.seed(23)
    # A leaning trunk made of three tapered sections.
    points = [(0, 0, 0), (0.08, 0, 0.55), (0.2, 0.02, 1.15), (0.36, 0.05, 1.72)]
    radii = (0.12, 0.1, 0.08)
    for i, radius in enumerate(radii):
        beam("bark", points[i], points[i + 1], radius, 6)
    crown = Vector(points[-1])
    for i in range(8):
        angle = i / 8 * math.tau + random.uniform(-0.12, 0.12)
        direction = Vector((math.cos(angle), math.sin(angle), 0))
        def frond(bm, a=direction):
            verts = []
            length, width = 0.92, 0.17
            sections = [(0, 0.03, 0.0), (0.45, width, 0.14), (0.8, width * 0.68, -0.08), (1.0, 0.0, -0.42)]
            side = Vector((-a.y, a.x, 0))
            for t, half_width, lift in sections:
                center = a * (length * t) + Vector((0, 0, lift))
                verts.append((bm.verts.new(center - side * half_width), bm.verts.new(center + side * half_width)))
            for j in range(len(verts) - 1):
                bm.faces.new((verts[j][0], verts[j + 1][0], verts[j + 1][1], verts[j][1]))
        new_object(frond, "palm" if i % 2 else "palm_dark", crown)
    for _ in range(3):
        blob("bark", crown + Vector((random.uniform(-0.1, 0.1), random.uniform(-0.1, 0.1), -0.08)), (0.07, 0.07, 0.08), subdivisions=1, jitter=0.0)
    export("palm")


def rock():
    random.seed(31)
    blob("stone", (0, 0, 0.32), (0.58, 0.46, 0.42), jitter=0.18)
    blob("stone_dark", (0.3, -0.18, 0.15), (0.26, 0.24, 0.2), jitter=0.2)
    export("rock")


def cloud():
    random.seed(41)
    for x, y, z, sx, sy, sz in ((0, 0, 0, 3.2, 1.9, 0.9), (2.2, 0.3, -0.1, 2.0, 1.3, 0.62), (-2.3, -0.2, -0.05, 2.3, 1.4, 0.7), (0.5, 0.4, 0.55, 1.8, 1.2, 0.72)):
        blob("cloud", (x, y, z), (sx, sy, sz), jitter=0.07)
    export("cloud")


# ----- People. "team" robes are tinted by tribe. -----

def body_parts(robe_height=0.34):
    cylinder("team", (0, 0, robe_height / 2 + 0.03), 0.15, robe_height, 7, top_radius=0.085)
    for x in (-0.05, 0.05):
        box("skin", (x, 0, 0.03), (0.07, 0.11, 0.06))
    box("skin", (0, 0, robe_height + 0.07), (0.17, 0.11, 0.08))
    blob("skin", (0, 0, robe_height + 0.17), (0.085, 0.085, 0.095), subdivisions=1, jitter=0.0)
    blob("hair", (0, 0.015, robe_height + 0.21), (0.087, 0.078, 0.063), subdivisions=1, jitter=0.0)
    return robe_height


def villager():
    random.seed(51)
    h = body_parts()
    for side in (-1, 1):
        beam("skin", (side * 0.1, 0, h + 0.08), (side * 0.15, 0.03, h - 0.1), 0.03)
    box("linen", (0, 0, h * 0.62), (0.21, 0.19, 0.035))
    export("villager")


def warrior_stone():
    """A Stone Age fighter: no armour, a club with a flint head."""
    random.seed(52)
    h = body_parts(0.3)
    beam("wood_light", (0.16, 0.06, 0.18), (0.2, 0.06, 0.62), 0.024, 5)
    blob("flint", (0.205, 0.06, 0.66), (0.075, 0.07, 0.09), jitter=0.15)
    export("warrior_stone")


def warrior_copper():
    """Copper Age: a leather cap and a copper-headed spear."""
    random.seed(54)
    h = body_parts(0.3)
    blob("wood_light", (0, 0, h + 0.22), (0.093, 0.093, 0.07), subdivisions=1, jitter=0.0)
    beam("wood_light", (0.17, 0.05, 0.02), (0.17, 0.05, 0.78), 0.016, 5)
    cylinder("ore", (0.17, 0.05, 0.83), 0.038, 0.12, 5, top_radius=0.0)
    cylinder("wood", (-0.18, 0.04, 0.27), 0.11, 0.03, 7, rotation=(0, math.pi / 2, 0))
    export("warrior_copper")


def warrior():
    """Bronze Age: helmet with a crest, breastplate, tall spear and a round shield."""
    random.seed(53)
    h = body_parts(0.3)
    blob("bronze", (0, 0, h + 0.22), (0.095, 0.095, 0.075), subdivisions=1, jitter=0.0)
    box("team", (0, 0, h + 0.3), (0.035, 0.17, 0.09))
    box("bronze", (0, 0, h + 0.015), (0.2, 0.14, 0.09), taper=0.82)
    beam("wood_light", (0.17, 0.05, 0.02), (0.17, 0.05, 0.86), 0.016, 5)
    cylinder("bronze", (0.17, 0.05, 0.92), 0.04, 0.13, 5, top_radius=0.0)
    cylinder("team", (-0.18, 0.04, 0.27), 0.135, 0.035, 9, rotation=(0, math.pi / 2, 0))
    cylinder("gold", (-0.205, 0.04, 0.27), 0.04, 0.025, 7, rotation=(0, math.pi / 2, 0))
    export("warrior")


def warrior_iron():
    """Iron Age: closed helmet, scale armour, tower shield and a long iron sword."""
    random.seed(55)
    h = body_parts(0.32)
    blob("iron_dark", (0, 0, h + 0.2), (0.1, 0.1, 0.1), subdivisions=1, jitter=0.0)
    box("team", (0, 0.01, h + 0.31), (0.03, 0.2, 0.13))
    box("iron_dark", (0, 0, h - 0.04), (0.22, 0.17, 0.2), taper=0.84)
    box("iron_dark", (0.18, 0.05, 0.56), (0.04, 0.025, 0.6), taper=0.5)
    box("gold", (0.18, 0.05, 0.25), (0.13, 0.04, 0.03))
    box("wood", (0.18, 0.05, 0.19), (0.03, 0.03, 0.1))
    box("team", (-0.2, 0.03, 0.3), (0.035, 0.27, 0.48))
    box("iron_dark", (-0.22, 0.03, 0.3), (0.015, 0.09, 0.42))
    export("warrior_iron")


# ----- Tools. Held in the right hand. "team" here is the metal of the tribe's current age. -----

def tool_axe():
    beam("wood_light", (0.17, 0.02, 0.1), (0.19, 0.03, 0.62), 0.016, 5)
    box("team", (0.25, 0.03, 0.57), (0.13, 0.03, 0.12))
    export("tool_axe")


def tool_hoe():
    beam("wood_light", (0.17, 0.02, 0.05), (0.2, 0.03, 0.72), 0.014, 5)
    box("team", (0.2, -0.04, 0.69), (0.05, 0.16, 0.05))
    export("tool_hoe")


def tool_pick():
    beam("wood_light", (0.17, 0.02, 0.15), (0.19, 0.03, 0.62), 0.016, 5)
    box("team", (0.19, 0.03, 0.62), (0.32, 0.035, 0.04), taper=0.8)
    export("tool_pick")


def tool_hammer():
    beam("wood_light", (0.17, 0.02, 0.2), (0.18, 0.03, 0.58), 0.016, 5)
    box("team", (0.18, 0.03, 0.6), (0.14, 0.09, 0.09))
    export("tool_hammer")


def tool_tablet():
    box("brick_light", (0.14, -0.1, 0.32), (0.13, 0.03, 0.17))
    box("brick_dark", (0.14, -0.118, 0.34), (0.09, 0.008, 0.012))
    box("brick_dark", (0.14, -0.118, 0.3), (0.09, 0.008, 0.012))
    export("tool_tablet")


def tool_staff():
    beam("wood", (0.16, 0.03, 0.02), (0.16, 0.03, 0.82), 0.016, 5)
    blob("team", (0.16, 0.03, 0.86), (0.04, 0.04, 0.05), jitter=0.0)
    export("tool_staff")


def standard():
    """The rally standard that a god plants. Followers gather to it."""
    random.seed(61)
    cylinder("stone_dark", (0, 0, 0.1), 0.38, 0.2, 7, top_radius=0.3)
    cylinder("wood", (0, 0, 1.55), 0.07, 2.9, 6)
    box("team", (0.42, 0, 2.3), (0.78, 0.05, 0.92))
    box("gold", (0, 0, 2.98), (0.34, 0.2, 0.1))
    for side in (-1, 1):
        beam("gold", (side * 0.1, 0, 3.0), (side * 0.32, 0, 3.42), 0.045)
    export("standard")


# ----- The Hand: reaches in from the viewer, fingers pointing along +Y -----

def finger(x, length, spread=0.0, curl=0.0, thick=0.2, z=0.0, base_y=1.0):
    """Two knuckled segments. Curl bends them down toward the palm."""
    point = Vector((x, base_y, z))
    pitch = -0.18 - curl * 0.45
    sway = spread
    for i, segment in enumerate((length * 0.56, length * 0.44)):
        direction = Vector((math.sin(sway) * math.cos(pitch), math.cos(sway) * math.cos(pitch), math.sin(pitch)))
        end = point + direction * segment
        beam("clay_hand", point, end, thick * (1 - i * 0.14), 6)
        blob("clay_hand", end, (thick * (0.95 - i * 0.14),) * 3, jitter=0.0)
        point = end
        pitch -= 0.25 + curl * 1.25
    return point


def hand(curl, name):
    random.seed(71)
    # Forearm, wrapped wrist, palm.
    beam("clay_hand", (0, -3.4, 1.15), (0, -0.92, 0.1), 0.42, 8)
    cylinder("gold", (0, -1.22, 0.23), 0.5, 0.2, 8, rotation=(math.radians(69), 0, 0))
    cylinder("gold", (0, -1.55, 0.38), 0.5, 0.11, 8, rotation=(math.radians(69), 0, 0))
    blob("clay_hand", (0, 0.05, 0), (0.86, 1.1, 0.33), subdivisions=2, jitter=0.0)
    for x, length, spread, thick in ((-0.6, 1.08, -0.1, 0.19), (-0.2, 1.3, -0.03, 0.21), (0.2, 1.25, 0.03, 0.21), (0.6, 1.0, 0.11, 0.18)):
        finger(x, length, spread, curl, thick)
    # Thumb comes off the side.
    thumb = 1 if curl < 0.5 else 0.75
    finger(-0.88, 0.95 * thumb, -0.85 + curl * 0.8, curl * 0.6, 0.23, -0.02, base_y=-0.15)
    export(name)


# Blender starts with a default cube, camera and light. Clear them, or they export with the first model.
for default_object in list(bpy.data.objects):
    bpy.data.objects.remove(default_object, do_unlink=True)

hand(0.0, "hand_open")
hand(0.95, "hand_grab")
hut()
house()
site()
rubble()
temple_model("temple_stone", 1)
temple_model("temple_copper", 2)
temple_model("temple", 3)
temple_model("temple_iron", 3, crown=True)
hut_reed()
farm()
mine()
forge()
school()
tower()
cedar()
palm()
rock()
cloud()
villager()
warrior_stone()
warrior_copper()
warrior()
warrior_iron()
tool_axe()
tool_hoe()
tool_pick()
tool_hammer()
tool_tablet()
tool_staff()
standard()
