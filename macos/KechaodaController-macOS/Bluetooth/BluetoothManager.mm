#import "BluetoothManager.h"
#import <CoreBluetooth/CoreBluetooth.h>

@interface BluetoothManager () <CBCentralManagerDelegate, CBPeripheralDelegate>
@property(nonatomic, strong) CBCentralManager *centralManager;
@property(nonatomic, strong) NSMutableDictionary<NSString *, CBPeripheral *> *peripherals;
@end

@implementation BluetoothManager

RCT_EXPORT_MODULE(BluetoothManager);

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (instancetype)init
{
  self = [super init];
  if (self) {
    _peripherals = [NSMutableDictionary dictionary];
    dispatch_async(dispatch_get_main_queue(), ^{
      self.centralManager = [[CBCentralManager alloc] initWithDelegate:self queue:nil];
    });
  }
  return self;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[
    @"BluetoothStateChanged",
    @"BluetoothDeviceFound",
    @"BluetoothConnected",
    @"BluetoothDisconnected",
    @"BluetoothServicesDiscovered",
    @"BluetoothCharacteristicsDiscovered",
    @"BluetoothError"
  ];
}

- (void)centralManagerDidUpdateState:(CBCentralManager *)central
{
  NSString *state;
  switch (central.state) {
    case CBManagerStatePoweredOn: state = @"poweredOn"; break;
    case CBManagerStatePoweredOff: state = @"poweredOff"; break;
    case CBManagerStateUnauthorized: state = @"unauthorized"; break;
    case CBManagerStateUnsupported: state = @"unsupported"; break;
    case CBManagerStateResetting: state = @"resetting"; break;
    default: state = @"unknown"; break;
  }
  [self sendEventWithName:@"BluetoothStateChanged" body:@{ @"state": state }];
}

RCT_EXPORT_METHOD(startScan)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.centralManager.state != CBManagerStatePoweredOn) {
      [self sendEventWithName:@"BluetoothError" body:@{ @"message": @"Bluetooth is not powered on" }];
      return;
    }
    [self.peripherals removeAllObjects];
    [self.centralManager scanForPeripheralsWithServices:nil options:@{
      CBCentralManagerScanOptionAllowDuplicatesKey: @NO
    }];
  });
}

RCT_EXPORT_METHOD(stopScan)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [self.centralManager stopScan];
  });
}

RCT_EXPORT_METHOD(connect:(NSString *)identifier)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    CBPeripheral *peripheral = self.peripherals[identifier];
    if (!peripheral) {
      [self sendEventWithName:@"BluetoothError" body:@{
        @"message": @"Device not found",
        @"identifier": identifier
      }];
      return;
    }
    [self.centralManager connectPeripheral:peripheral options:nil];
  });
}

RCT_EXPORT_METHOD(disconnect:(NSString *)identifier)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    CBPeripheral *peripheral = self.peripherals[identifier];
    if (peripheral) {
      [self.centralManager cancelPeripheralConnection:peripheral];
    }
  });
}

- (void)centralManager:(CBCentralManager *)central
 didDiscoverPeripheral:(CBPeripheral *)peripheral
      advertisementData:(NSDictionary<NSString *, id> *)advertisementData
                   RSSI:(NSNumber *)RSSI
{
  NSString *identifier = peripheral.identifier.UUIDString;
  self.peripherals[identifier] = peripheral;
  NSString *name = peripheral.name ?: advertisementData[CBAdvertisementDataLocalNameKey];
  if (name.length == 0) {
    name = @"Unknown Device";
  }
  NSMutableDictionary *device = [@{
    @"id": identifier,
    @"name": name,
    @"rssi": RSSI ?: @0,
    @"connected": @(peripheral.state == CBPeripheralStateConnected)
  } mutableCopy];
  NSData *manufacturerData = advertisementData[CBAdvertisementDataManufacturerDataKey];
  if (manufacturerData) {
    device[@"manufacturerData"] = [manufacturerData base64EncodedStringWithOptions:0];
  }
  [self sendEventWithName:@"BluetoothDeviceFound" body:device];
}

- (void)centralManager:(CBCentralManager *)central didConnectPeripheral:(CBPeripheral *)peripheral
{
  peripheral.delegate = self;
  [self sendEventWithName:@"BluetoothConnected" body:@{
    @"id": peripheral.identifier.UUIDString,
    @"name": peripheral.name ?: @"Unknown Device"
  }];
  [peripheral discoverServices:nil];
}

- (void)centralManager:(CBCentralManager *)central
 didFailToConnectPeripheral:(CBPeripheral *)peripheral
                 error:(NSError *)error
{
  [self sendEventWithName:@"BluetoothError" body:@{
    @"id": peripheral.identifier.UUIDString,
    @"message": error.localizedDescription ?: @"Connection failed"
  }];
}

- (void)centralManager:(CBCentralManager *)central
didDisconnectPeripheral:(CBPeripheral *)peripheral
                 error:(NSError *)error
{
  [self sendEventWithName:@"BluetoothDisconnected" body:@{
    @"id": peripheral.identifier.UUIDString,
    @"name": peripheral.name ?: @"Unknown Device"
  }];
}

- (void)peripheral:(CBPeripheral *)peripheral didDiscoverServices:(NSError *)error
{
  if (error) {
    [self sendEventWithName:@"BluetoothError" body:@{
      @"id": peripheral.identifier.UUIDString,
      @"message": error.localizedDescription
    }];
    return;
  }
  NSMutableArray *services = [NSMutableArray array];
  for (CBService *service in peripheral.services) {
    [services addObject:@{
      @"uuid": service.UUID.UUIDString,
      @"primary": @(service.isPrimary)
    }];
  }
  [self sendEventWithName:@"BluetoothServicesDiscovered" body:@{
    @"id": peripheral.identifier.UUIDString,
    @"services": services
  }];
  for (CBService *service in peripheral.services) {
    [peripheral discoverCharacteristics:nil forService:service];
  }
}

- (void)peripheral:(CBPeripheral *)peripheral
 didDiscoverCharacteristicsForService:(CBService *)service
             error:(NSError *)error
{
  if (error) {
    [self sendEventWithName:@"BluetoothError" body:@{
      @"id": peripheral.identifier.UUIDString,
      @"service": service.UUID.UUIDString,
      @"message": error.localizedDescription
    }];
    return;
  }
  NSMutableArray *characteristics = [NSMutableArray array];
  for (CBCharacteristic *characteristic in service.characteristics) {
    [characteristics addObject:@{
      @"uuid": characteristic.UUID.UUIDString,
      @"properties": @(characteristic.properties)
    }];
  }
  [self sendEventWithName:@"BluetoothCharacteristicsDiscovered" body:@{
    @"id": peripheral.identifier.UUIDString,
    @"service": service.UUID.UUIDString,
    @"characteristics": characteristics
  }];
}

@end