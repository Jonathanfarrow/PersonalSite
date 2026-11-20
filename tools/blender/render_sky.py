"""Render the sky of the house scene as a panorama for the website background.

Run:  blender -b --python tools/blender/render_sky.py
"""
import bpy, sys, os, math
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
sys.argv = sys.argv[:sys.argv.index('--')] if '--' in sys.argv else sys.argv
ns = {'__file__': os.path.join(HERE, 'build_cutaway.py'), '__name__': 'build'}
exec(compile(open(ns['__file__']).read(), ns['__file__'], 'exec'), ns)
scene = bpy.context.scene
for o in list(scene.objects):
    if o.type in ('MESH', 'LIGHT'): o.hide_render = True
cam = scene.camera; cam.data.type = 'PANO'
try: cam.data.panorama_type = 'EQUIRECTANGULAR'
except Exception: cam.data.cycles.panorama_type = 'EQUIRECTANGULAR'
cam.rotation_euler = (math.pi / 2, 0, 0); cam.location = (0, 0, 2)
scene.use_nodes = False
scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.use_denoising = False; scene.cycles.samples = 24
scene.render.resolution_x = 4096; scene.render.resolution_y = 2048
scene.view_settings.view_transform = 'Filmic'; scene.view_settings.look = 'Medium High Contrast'; scene.view_settings.exposure = 0.45
scene.render.image_settings.file_format = 'JPEG'; scene.render.image_settings.quality = 88
scene.render.filepath = os.path.join(ROOT, 'src/assets/models/sky_new.jpg'); bpy.ops.render.render(write_still=True)
