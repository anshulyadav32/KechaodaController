#import "KechaodaUSBModule.h"

#import <fcntl.h>
#import <termios.h>
#import <unistd.h>

@interface KechaodaUSBModule () {
  int _fd;
  dispatch_queue_t _serialQueue;
  BOOL _running;
  NSString *_port;
}
@end

@implementation KechaodaUSBModule

RCT_EXPORT_MODULE(KechaodaUSB);

- (instancetype)init
{
  self = [super init];
  if (self) {
    _fd = -1;
    _running = NO;
    _serialQueue = dispatch_queue_create("com.kechaoda.serial", DISPATCH_QUEUE_SERIAL);
  }
  return self;
}

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[
    @"KechaodaData",
    @"KechaodaConnected",
    @"KechaodaDisconnected",
    @"KechaodaError",
  ];
}

RCT_REMAP_METHOD(listPorts,
                 listPortsWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(_serialQueue, ^{
    NSMutableArray *ports = [NSMutableArray array];
    NSArray *prefixes = @[
      @"cu.usbmodem",
      @"tty.usbmodem",
      @"cu.usbserial",
      @"tty.usbserial",
    ];

    for (NSString *file in [[NSFileManager defaultManager] contentsOfDirectoryAtPath:@"/dev" error:nil]) {
      for (NSString *prefix in prefixes) {
        NSString *fullPath = [@"/dev" stringByAppendingPathComponent:file];
        if ([file hasPrefix:prefix] &&
            [[NSFileManager defaultManager] isReadableFileAtPath:fullPath] &&
            ![ports containsObject:fullPath]) {
          [ports addObject:fullPath];
          break;
        }
      }
    }

    resolve(ports);
  });
}

RCT_REMAP_METHOD(connect,
                 connectPort:(NSString *)port
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(_serialQueue, ^{
    [self closeSerial];

    int fd = open(port.UTF8String, O_RDWR | O_NOCTTY | O_NONBLOCK);
    if (fd < 0) {
      reject(@"USB_OPEN", @"Unable to open USB serial port", nil);
      return;
    }

    struct termios options;
    if (tcgetattr(fd, &options) != 0) {
      close(fd);
      reject(@"USB_TERMIOS", @"Unable to configure serial port", nil);
      return;
    }

    cfmakeraw(&options);
    cfsetspeed(&options, B115200);
    options.c_cflag |= CLOCAL | CREAD;
    options.c_cflag &= ~CSIZE;
    options.c_cflag |= CS8;
    options.c_cflag &= ~(PARENB | CSTOPB | CRTSCTS);
    options.c_cc[VMIN] = 0;
    options.c_cc[VTIME] = 1;

    if (tcsetattr(fd, TCSANOW, &options) != 0) {
      close(fd);
      reject(@"USB_TERMIOS", @"Unable to apply serial port settings", nil);
      return;
    }

    _fd = fd;
    _port = [port copy];
    _running = YES;

    dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
      [self readLoop];
    });

    [self sendEventWithName:@"KechaodaConnected" body:@{ @"port": port }];
    resolve(@YES);
  });
}

- (void)readLoop
{
  char buffer[1024];
  while (_running && _fd >= 0) {
    ssize_t count = read(_fd, buffer, sizeof(buffer));
    if (count > 0) {
      NSData *data = [NSData dataWithBytes:buffer length:(NSUInteger)count];
      NSString *text = [[NSString alloc] initWithData:data encoding:NSASCIIStringEncoding];
      if (text.length > 0) {
        [self sendEventWithName:@"KechaodaData" body:@{ @"data": text }];
      }
    } else {
      usleep(10000);
    }
  }
}

RCT_REMAP_METHOD(send,
                 sendCommand:(NSString *)command
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(_serialQueue, ^{
    if (_fd < 0) {
      reject(@"USB_NOT_CONNECTED", @"KECHAODA USB is not connected", nil);
      return;
    }

    NSString *line = [command hasSuffix:@"\r"] ? command : [command stringByAppendingString:@"\r"];
    NSData *data = [line dataUsingEncoding:NSASCIIStringEncoding];
    ssize_t written = write(_fd, data.bytes, data.length);
    if (written < 0 || (NSUInteger)written != data.length) {
      reject(@"USB_WRITE", @"Unable to write to USB serial port", nil);
      return;
    }
    resolve(@YES);
  });
}

RCT_EXPORT_METHOD(disconnect)
{
  dispatch_async(_serialQueue, ^{
    [self closeSerial];
  });
}

- (void)closeSerial
{
  _running = NO;
  if (_fd >= 0) {
    close(_fd);
    _fd = -1;
    [self sendEventWithName:@"KechaodaDisconnected" body:@{}];
  }
  _port = nil;
}

- (void)dealloc
{
  _running = NO;
  if (_fd >= 0) {
    close(_fd);
  }
}

@end
