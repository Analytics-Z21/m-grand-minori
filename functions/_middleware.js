export const onRequest = async (context) => {
     const url = new URL(context.request.url);
     if (url.hostname === 'ver2.m-grandminori.com.my') {
       url.hostname = 'www.ver2.m-grandminori.com.my';
       return Response.redirect(url.toString(), 301);
     }
     return context.next();
   };

