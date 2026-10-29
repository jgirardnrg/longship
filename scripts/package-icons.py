"""Create Windows/Linux/macOS icon assets from the rendered Longship rune."""
import pathlib,struct,subprocess
root=pathlib.Path(__file__).resolve().parent.parent/'resources/icons'
images={}
for size in [16,24,32,48,64,128,256,512,1024]:
 output=root/f'{size}x{size}.png'
 subprocess.run(['sips','-z',str(size),str(size),str(root/'longship.png'),'--out',str(output)],check=True,stdout=subprocess.DEVNULL)
 images[size]=output.read_bytes()
selected=[16,24,32,48,64,128,256];offset=6+16*len(selected);header=struct.pack('<HHH',0,1,len(selected));payload=b''
for size in selected:
 data=images[size];header+=struct.pack('<BBBBHHII',size%256,size%256,0,0,1,32,len(data),offset);payload+=data;offset+=len(data)
(root/'longship.ico').write_bytes(header+payload)
chunks=b''
for size,tag in [(16,b'icp4'),(32,b'icp5'),(64,b'icp6'),(128,b'ic07'),(256,b'ic08'),(512,b'ic09'),(1024,b'ic10')]:
 data=images[size];chunks+=tag+struct.pack('>I',len(data)+8)+data
(root/'longship.icns').write_bytes(b'icns'+struct.pack('>I',len(chunks)+8)+chunks)
