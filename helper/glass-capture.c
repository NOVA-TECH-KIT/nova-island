// Stable Node-API bridge: apply Win32 exclusion to our own HWND and verify the
// actual OS value. Electron's cached isContentProtected() can report true while
// GetWindowDisplayAffinity still reports WDA_NONE on a transparent window.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdint.h>
#include <string.h>

typedef void* napi_env;
typedef void* napi_value;
typedef void* napi_callback_info;
typedef napi_value (*napi_callback)(napi_env, napi_callback_info);
static int (*get_cb_info)(napi_env,napi_callback_info,size_t*,napi_value*,napi_value*,void**);
static int (*get_buffer_info)(napi_env,napi_value,void**,size_t*);
static int (*create_uint32)(napi_env,uint32_t,napi_value*);
static int (*create_function)(napi_env,const char*,size_t,napi_callback,void*,napi_value*);
static int (*set_named_property)(napi_env,napi_value,const char*,napi_value);
static int (*create_object)(napi_env,napi_value*);
static int (*create_int32)(napi_env,int32_t,napi_value*);
static HHOOK mouse_hook=NULL;
static uint32_t click_serial=0;
static POINT click_point={0,0};
static LRESULT CALLBACK glass_mouse_hook(int code,WPARAM message,LPARAM data) {
  if (code>=0 && (message==WM_LBUTTONDOWN || message==WM_RBUTTONDOWN || message==WM_MBUTTONDOWN)) {
    click_point=((MSLLHOOKSTRUCT*)data)->pt;
    click_serial++;
  }
  return CallNextHookEx(mouse_hook,code,message,data);
}
static napi_value mouse_click(napi_env env,napi_callback_info info) {
  napi_value object,value;
  if (!mouse_hook) {
    HMODULE self=NULL;
    GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,(LPCWSTR)glass_mouse_hook,&self);
    mouse_hook=SetWindowsHookExW(WH_MOUSE_LL,glass_mouse_hook,self,0);
  }
  create_object(env,&object);
  create_uint32(env,click_serial,&value); set_named_property(env,object,"serial",value);
  create_int32(env,click_point.x,&value); set_named_property(env,object,"x",value);
  create_int32(env,click_point.y,&value); set_named_property(env,object,"y",value);
  create_uint32(env,mouse_hook?1:0,&value); set_named_property(env,object,"available",value);
  return object;
}

static napi_value exclude(napi_env env, napi_callback_info info) {
  napi_value arg, result;
  size_t argc=1, size=0;
  void* data=NULL;
  HWND hwnd=NULL;
  DWORD value=0, pid=0, code=ERROR_INVALID_PARAMETER;
  if (!get_cb_info(env,info,&argc,&arg,NULL,NULL) && argc==1 &&
      !get_buffer_info(env,arg,&data,&size) && size>=sizeof(HWND)) {
    memcpy(&hwnd,data,sizeof(HWND));
    GetWindowThreadProcessId(hwnd,&pid);
    if (pid==GetCurrentProcessId()) {
      BOOL ok=SetWindowDisplayAffinity(hwnd,0x11);
      if (!ok && GetLastError()==ERROR_NOT_ENOUGH_MEMORY) {
        // Electron's own Windows compatibility path requires WS_EX_LAYERED
        // for display affinity on older DWM surfaces (electron PR #47856).
        LONG_PTR style=GetWindowLongPtrW(hwnd,GWL_EXSTYLE);
        SetWindowLongPtrW(hwnd,GWL_EXSTYLE,(style | WS_EX_LAYERED) & ~WS_EX_NOREDIRECTIONBITMAP);
        SetLayeredWindowAttributes(hwnd,0,255,LWA_ALPHA);
        ok=SetWindowDisplayAffinity(hwnd,0x11);
        if (!ok) SetWindowLongPtrW(hwnd,GWL_EXSTYLE,style);
      }
      if (ok && GetWindowDisplayAffinity(hwnd,&value)) code=value;
      else code=0x80000000u | GetLastError();
    } else code=0x80000000u | ERROR_ACCESS_DENIED;
  }
  create_uint32(env,code,&result);
  return result;
}

__declspec(dllexport) napi_value napi_register_module_v1(napi_env env,napi_value exports) {
  HMODULE host=GetModuleHandleW(NULL);
  napi_value fn;
  get_cb_info=(void*)GetProcAddress(host,"napi_get_cb_info");
  get_buffer_info=(void*)GetProcAddress(host,"napi_get_buffer_info");
  create_uint32=(void*)GetProcAddress(host,"napi_create_uint32");
  create_function=(void*)GetProcAddress(host,"napi_create_function");
  set_named_property=(void*)GetProcAddress(host,"napi_set_named_property");
  create_object=(void*)GetProcAddress(host,"napi_create_object");
  create_int32=(void*)GetProcAddress(host,"napi_create_int32");
  if (!get_cb_info || !get_buffer_info || !create_uint32 || !create_function || !set_named_property) return exports;
  create_function(env,"exclude",7,exclude,NULL,&fn);
  set_named_property(env,exports,"exclude",fn);
  if (create_object && create_int32) {
    create_function(env,"mouseClick",10,mouse_click,NULL,&fn);
    set_named_property(env,exports,"mouseClick",fn);
  }
  return exports;
}
